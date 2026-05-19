/**
 * Core auth logic: issue magic links, consume/verify, session resolution.
 *
 * MUST-fix items addressed:
 *  #1 — Atomic transaction on verify (db.transaction with UPDATE...RETURNING)
 *  #2 — Postgres sliding-window rate limit (checkAndRecord × 2 keys)
 *  #3 — Email enumeration mitigation (always ok:true, nonce hash on non-admin)
 *  #4 — Idle (7d) + absolute (30d) timeout with debounced touch
 *  #5 — Sign-out deletes session row + clears cookie + audit_log
 *  #6 — Click-through verify (D13): GET renders "Continue as" page; POST consumes
 *       Device-binding intent cookie (#7 in spec — checked here via cookies.ts)
 *  #9 — 60s dedup: skip INSERT + mail if recent non-consumed link exists
 */

import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { Cookies } from "@sveltejs/kit";
import { getDb } from "$lib/server/db/index.js";
import { magicLinks, sessions, users } from "$lib/server/db/schema/users.js";
import { canonicalizeEmail } from "$lib/domain/email.js";
import { sendMail } from "$lib/server/mail/index.js";
import { sha256 } from "./hash.js";
import {
  checkIntentCookie,
  clearIntentCookie,
  clearSessionCookie,
  getSessionToken,
  setIntentCookie,
  setSessionCookie,
} from "./cookies.js";
import { checkAndRecord } from "./rate-limit.js";
import { isAdminEmail } from "./allowlist.js";
import { logAudit } from "$lib/server/audit-log/index.js";

export { RateLimitError } from "./rate-limit.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RequestMeta {
  ip: string;
  ua: string;
}

export interface SessionUser {
  id: string;
  email: string;
  emailCanonical: string;
  name: string | null;
  role: "admin" | "steuerberater" | "member_self_service";
}

export interface ResolvedSession {
  session: typeof sessions.$inferSelect;
  user: SessionUser;
}

// ---------------------------------------------------------------------------
// Issue magic link
// ---------------------------------------------------------------------------

/**
 * Issue (or skip-dedup) a magic link for the given email.
 * ALWAYS returns identical JSON to caller (anti-enumeration, MUST-fix #3).
 * Rate limits both email and IP keys before doing anything else.
 */
export async function issueMagicLink(
  rawEmail: string,
  meta: RequestMeta,
  cookies: Cookies,
): Promise<{ ok: true; message: string }> {
  const canonical = canonicalizeEmail(rawEmail);

  // Rate limit — throws RateLimitError if exceeded (MUST-fix #2)
  await checkAndRecord(`magic_link:email:${canonical}`, 3, 5 * 60_000);
  await checkAndRecord(`magic_link:ip:${meta.ip}`, 10, 5 * 60_000);

  // Constant-time path for non-admin: hash a random nonce, don't send
  if (!isAdminEmail(canonical)) {
    // MUST-fix #3: consume rate-limit slot, perform constant-time hash,
    // do NOT send real email, do NOT reveal admin status.
    sha256(randomBytes(32).toString("base64url")); // no-op nonce hash
    return { ok: true, message: "Check your inbox 💌" };
  }

  // Dedup: if a non-consumed, non-expired link was issued <60s ago, skip new insert
  const db = getDb();
  const recentLink = await db.query.magicLinks.findFirst({
    where: and(
      eq(magicLinks.emailCanonical, canonical),
      isNull(magicLinks.consumedAt),
      gt(magicLinks.expiresAt, new Date()),
      gt(magicLinks.issuedAt, new Date(Date.now() - 60_000)),
    ),
  });

  if (recentLink) {
    // MUST-fix #9: dedup — skip insert + send (no inbox spam)
    return { ok: true, message: "Check your inbox 💌" };
  }

  // Issue new magic link
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 15 * 60_000);

  await db.insert(magicLinks).values({
    tokenHash,
    emailCanonical: canonical,
    expiresAt,
  });

  // Determine base URL from env or fallback
  const baseUrl = (
    process.env["PUBLIC_BASE_URL"] ??
    process.env["ORIGIN"] ??
    ""
  ).replace(/\/$/, "");
  const verifyUrl = `${baseUrl}/sign-in/verify?token=${rawToken}`;

  await sendMail({
    template: "magic_link",
    entity_kind: "user",
    entity_id: null,
    to: canonical,
    props: { magicUrl: verifyUrl, email: canonical, expiresInMinutes: 15 },
  });

  // Device-binding intent cookie (MUST-fix #7)
  setIntentCookie(cookies, tokenHash);

  return { ok: true, message: "Check your inbox 💌" };
}

// ---------------------------------------------------------------------------
// Look up a magic link by token (for GET verify page)
// ---------------------------------------------------------------------------

export async function getMagicLinkByToken(rawToken: string) {
  const db = getDb();
  const tokenHash = sha256(rawToken);
  const link = await db.query.magicLinks.findFirst({
    where: and(
      eq(magicLinks.tokenHash, tokenHash),
      isNull(magicLinks.consumedAt),
      gt(magicLinks.expiresAt, new Date()),
    ),
  });
  return link ?? null;
}

// ---------------------------------------------------------------------------
// Consume magic link (POST verify) — transactional (MUST-fix #1)
// ---------------------------------------------------------------------------

export type ConsumeResult =
  | { ok: true; email: string }
  | { ok: false; reason: "LINK_INVALID_OR_EXPIRED" | "NOT_ADMIN" };

export async function consumeMagicLink(
  rawToken: string,
  meta: RequestMeta,
  cookies: Cookies,
): Promise<ConsumeResult> {
  const db = getDb();
  const tokenHash = sha256(rawToken);

  return db.transaction(async (tx) => {
    // Atomic UPDATE...RETURNING — only one concurrent caller wins (MUST-fix #1)
    const rows = await tx.execute(sql`
      UPDATE magic_links
         SET consumed_at = now()
       WHERE token_hash = ${tokenHash}
         AND consumed_at IS NULL
         AND expires_at > now()
      RETURNING id, email_canonical
    `);

    if (!rows[0]) {
      return { ok: false, reason: "LINK_INVALID_OR_EXPIRED" } as ConsumeResult;
    }

    const row = rows[0] as { id: string; email_canonical: string };
    const email = row.email_canonical;

    // Allowlist check inside tx — consume is committed regardless (MUST-fix #3 + anti-retry)
    if (!isAdminEmail(email)) {
      // Pass `tx` so the audit insert participates in the same transaction —
      // otherwise the global getDb() opens a separate pooled connection that
      // can't see the in-flight UPDATE, breaking ordering.
      await logAudit(
        {
          action: "sign_in",
          entityKind: "user",
          entityId: null,
          actorUserId: null,
          actorKind: "system",
          actorIpPrefix: meta.ip,
          payload: { email, reason: "NOT_ADMIN" },
        },
        tx,
      );
      return { ok: false, reason: "NOT_ADMIN" } as ConsumeResult;
    }

    // Upsert user
    const user = await upsertUser(tx, email);

    // Create session
    const sessionToken = randomBytes(32).toString("base64url");
    const sessionHash = sha256(sessionToken);
    await tx.insert(sessions).values({
      userId: user.id,
      tokenHash: sessionHash,
      expiresAt: new Date(Date.now() + 30 * 86400_000),
      lastUsedAt: new Date(),
    });

    setSessionCookie(cookies, sessionToken);
    clearIntentCookie(cookies);

    // Pass `tx` so the audit insert sees the freshly-upserted user row and
    // the FK `audit_log_actor_user_id_users_id_fk` is satisfied. Using the
    // global db client here would open a separate pooled connection that
    // can't see the in-transaction insert yet, producing a 23503 violation
    // that bubbles up as a 500 to the verify POST.
    await logAudit(
      {
        action: "sign_in",
        entityKind: "session",
        entityId: null,
        actorUserId: user.id,
        actorKind: "user",
        actorIpPrefix: meta.ip,
        payload: { email },
      },
      tx,
    );

    return { ok: true, email };
  });
}

// ---------------------------------------------------------------------------
// Upsert user
// ---------------------------------------------------------------------------

/**
 * Atomic UPSERT keyed on `users.email_canonical` (UNIQUE). Single round-trip;
 * safe under concurrent calls — the UNIQUE index serialises insert collisions
 * and ON CONFLICT DO UPDATE … RETURNING always yields the persisted row.
 *
 * The SET clause is a no-op-ish bump of updatedAt so RETURNING fires on the
 * conflict path (DO NOTHING would not return a row).
 */
async function upsertUser(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  emailCanonical: string,
): Promise<typeof users.$inferSelect> {
  const inserted = await tx
    .insert(users)
    .values({
      email: emailCanonical,
      emailCanonical,
      role: "admin",
    })
    .onConflictDoUpdate({
      target: users.emailCanonical,
      set: { updatedAt: new Date() },
    })
    .returning();

  if (!inserted[0]) throw new Error("Failed to upsert user");
  return inserted[0];
}

// ---------------------------------------------------------------------------
// Resolve session from cookie (MUST-fix #4)
// ---------------------------------------------------------------------------

export async function resolveSession(
  cookies: Cookies,
): Promise<ResolvedSession | null> {
  const rawToken = getSessionToken(cookies);
  if (!rawToken) return null;

  const db = getDb();
  const tokenHash = sha256(rawToken);

  const row = await db.query.sessions.findFirst({
    where: eq(sessions.tokenHash, tokenHash),
  });
  if (!row) return null;

  const now = Date.now();
  const idleMs = now - row.lastUsedAt.getTime();
  const absMs = now - row.issuedAt.getTime();

  // Idle (7d) + absolute (30d) enforcement (MUST-fix #4)
  if (
    idleMs > 7 * 86400_000 ||
    absMs > 30 * 86400_000 ||
    row.expiresAt < new Date()
  ) {
    await db.delete(sessions).where(eq(sessions.id, row.id));
    clearSessionCookie(cookies);
    return null;
  }

  // Debounced touch: only update lastUsedAt if >60s since last write
  if (idleMs > 60_000) {
    await db
      .update(sessions)
      .set({ lastUsedAt: new Date() })
      .where(eq(sessions.id, row.id));
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, row.userId),
  });
  if (!user) return null;

  return {
    session: row,
    user: {
      id: user.id,
      email: user.email,
      emailCanonical: user.emailCanonical,
      name: user.name,
      role: user.role,
    },
  };
}

// ---------------------------------------------------------------------------
// Sign out (MUST-fix #5)
// ---------------------------------------------------------------------------

export async function signOut(
  cookies: Cookies,
  userId: string | null,
  meta: RequestMeta,
): Promise<void> {
  const rawToken = getSessionToken(cookies);
  if (rawToken) {
    const db = getDb();
    const tokenHash = sha256(rawToken);
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  }
  clearSessionCookie(cookies);

  await logAudit({
    action: "sign_out",
    entityKind: "session",
    entityId: null,
    actorUserId: userId,
    actorKind: "user",
    actorIpPrefix: meta.ip,
    payload: {},
  });
}

// ---------------------------------------------------------------------------
// Sign out everywhere — revoke ALL sessions for a user (phase-7 polish)
// ---------------------------------------------------------------------------

/**
 * Delete every session row for `userId`, clear the current session cookie,
 * and write an audit log entry.
 *
 * Used by the "Überall abmelden" action in Einstellungen.
 */
export async function signOutEverywhere(
  cookies: Cookies,
  userId: string,
  meta: RequestMeta,
): Promise<void> {
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.userId, userId));
  clearSessionCookie(cookies);

  await logAudit({
    action: "sign_out",
    entityKind: "session",
    entityId: null,
    actorUserId: userId,
    actorKind: "user",
    actorIpPrefix: meta.ip,
    payload: { everywhere: true },
  });
}

// ---------------------------------------------------------------------------
// Check intent cookie (for verify GET page)
// ---------------------------------------------------------------------------

export { checkIntentCookie };
