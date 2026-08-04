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
import { ipToPrefix } from "$lib/domain/ip.js";
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
import {
  findActiveMemberByEmail,
  getActiveMemberById,
} from "./member-allowlist.js";
import { logAudit } from "$lib/server/audit-log/index.js";

export { RateLimitError } from "./rate-limit.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RequestMeta {
  ip: string;
  ua: string;
  /** Origin of the current request (e.g. http://127.0.0.1:5175), used as fallback when PUBLIC_BASE_URL/ORIGIN are unset. */
  origin?: string;
}

export interface SessionUser {
  id: string;
  email: string;
  emailCanonical: string;
  name: string | null;
  role: "admin" | "steuerberater" | "member_self_service";
  /**
   * Linked Mitglied id for self-service logins (and for admins who are also
   * members). NULL for admin/steuerberater accounts that are not members.
   * Read by the route guards (hooks.server.ts) to gate `/portal` without a
   * per-request members query. Aurora A-flow S2a.
   */
  memberId: string | null;
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
 *
 * Eligible senders are (a) admins (ADMIN_EMAILS) and (b) ACTIVE members
 * (`members` row with a matching email). Both allowlists get the SAME identical
 * response and the same real link — the issued link is role-agnostic (it only
 * carries the canonical email); the role is resolved at consume time. A caller
 * cannot tell admin, member, and unknown apart from the response (S2a).
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

  // Eligibility: admin OR active member. The members lookup for the non-admin
  // branch makes member-vs-non-member timing near-identical (both scan) — the
  // pair that matters for the MEMBER allowlist's enumeration mitigation.
  const isAdmin = isAdminEmail(canonical);
  const member = isAdmin ? null : await findActiveMemberByEmail(canonical);

  // Constant-time path for non-eligible emails: hash a random nonce, don't send
  if (!isAdmin && !member) {
    // MUST-fix #3: consume rate-limit slot, perform constant-time hash,
    // do NOT send real email, do NOT reveal admin/member status.
    sha256(randomBytes(32).toString("base64url")); // no-op nonce hash
    return { ok: true, message: "Schau in dein Postfach 💌" };
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
    return { ok: true, message: "Schau in dein Postfach 💌" };
  }

  // Issue new magic link
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 15 * 60_000);

  const [magicLinkRow] = await db
    .insert(magicLinks)
    .values({
      tokenHash,
      emailCanonical: canonical,
      expiresAt,
    })
    .returning({ id: magicLinks.id });

  // Determine base URL for the magic-link target.
  //
  // SECURITY: this must NEVER come from a Host-header-derived value in
  // production. An attacker who POSTs to /sign-in with a forged Host can
  // otherwise cause the victim's magic-link email to point at their domain
  // (full token theft). See docs/reviews/2026-05-19-security-review.md CRIT-2.
  //
  // Resolution order:
  //   1. PUBLIC_BASE_URL env (canonical prod URL)
  //   2. ORIGIN env (SvelteKit convention, also used by adapter-node CSRF)
  //   3. meta.origin from the request — ONLY in dev (NODE_ENV !== "production"),
  //      so the local dev experience doesn't break when env is unset.
  const isProd = (process.env["NODE_ENV"] ?? "").toLowerCase() === "production";
  const envBaseUrl =
    process.env["PUBLIC_BASE_URL"] || process.env["ORIGIN"] || "";
  const baseUrl = (envBaseUrl || (isProd ? "" : meta.origin || "")).replace(
    /\/$/,
    "",
  );

  if (!baseUrl) {
    // Better to fail loudly than to send a broken/forged URL.
    throw new Error(
      "Cannot issue magic link: no PUBLIC_BASE_URL / ORIGIN configured and no request origin available.",
    );
  }
  const verifyUrl = `${baseUrl}/sign-in/verify?token=${rawToken}`;

  // Each magic_link issuance is a distinct event — use the magic_links.id as
  // entity_id so the sent_mails UNIQUE(template, entity_kind, entity_id,
  // send_attempt) index does not collapse all sends (NULLS NOT DISTINCT).
  await sendMail({
    template: "magic_link",
    entity_kind: "user",
    entity_id: magicLinkRow!.id,
    to: canonical,
    props: {
      magicUrl: verifyUrl,
      email: canonical,
      expiresInMinutes: 15,
      // Board #163 J-M3: members get portal wording, admins the Buchhaltung.
      audience: isAdmin ? "admin" : "member",
    },
  });

  // Device-binding intent cookie (MUST-fix #7)
  setIntentCookie(cookies, tokenHash);

  return { ok: true, message: "Schau in dein Postfach 💌" };
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
  | { ok: true; email: string; role: SessionUser["role"] }
  | { ok: false; reason: "LINK_INVALID_OR_EXPIRED" | "NOT_ELIGIBLE" };

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

    // Resolve role INSIDE the tx — consume is committed regardless of the
    // outcome (MUST-fix #3 + anti-retry). Admin takes precedence; an active
    // member (or an admin who is also a member) is linked to its Mitglied row.
    const isAdmin = isAdminEmail(email);
    const member = await findActiveMemberByEmail(email, tx);

    if (!isAdmin && !member) {
      // Neither allowlist matches → not eligible. Pass `tx` so the audit insert
      // participates in the same transaction — otherwise the global getDb()
      // opens a separate pooled connection that can't see the in-flight UPDATE,
      // breaking ordering.
      await logAudit(
        {
          action: "sign_in",
          entityKind: "user",
          entityId: null,
          actorUserId: null,
          actorKind: "system",
          actorIpPrefix: ipToPrefix(meta.ip),
          payload: { email, reason: "NOT_ELIGIBLE" },
        },
        tx,
      );
      return { ok: false, reason: "NOT_ELIGIBLE" } as ConsumeResult;
    }

    // Admin precedence; member_id set for members AND for admins-who-are-members
    // (so the latter may also reach /portal). Auto-provisions on first sign-in.
    const role: SessionUser["role"] = isAdmin ? "admin" : "member_self_service";
    const memberId = member?.id ?? null;
    const user = await upsertUser(tx, email, role, memberId);

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
        actorIpPrefix: ipToPrefix(meta.ip),
        payload: { email, role },
      },
      tx,
    );

    return { ok: true, email, role };
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
 * `role` + `memberId` are written on BOTH the insert and the conflict path, so
 * a returning login always reflects the CURRENT allowlist state (an email
 * promoted to admin upgrades on next sign-in; a member who left is nulled out
 * — the resolveSession re-check revokes the live session in the meantime). The
 * updatedAt bump also ensures RETURNING fires on conflict (DO NOTHING would not
 * return a row).
 */
async function upsertUser(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  emailCanonical: string,
  role: SessionUser["role"],
  memberId: string | null,
): Promise<typeof users.$inferSelect> {
  const inserted = await tx
    .insert(users)
    .values({
      email: emailCanonical,
      emailCanonical,
      role,
      memberId,
    })
    .onConflictDoUpdate({
      target: users.emailCanonical,
      set: { role, memberId, updatedAt: new Date() },
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

  // PR1 latency: single JOIN replaces two serial round-trips (sessions lookup
  // then users lookup). All security checks below are byte-for-byte identical
  // to the original two-query path.
  const rows = await db
    .select({
      // session fields
      sessionId: sessions.id,
      sessionUserId: sessions.userId,
      sessionTokenHash: sessions.tokenHash,
      sessionIssuedAt: sessions.issuedAt,
      sessionLastUsedAt: sessions.lastUsedAt,
      sessionExpiresAt: sessions.expiresAt,
      sessionRevokedAt: sessions.revokedAt,
      sessionDeviceFingerprint: sessions.deviceFingerprint,
      // user fields
      userId: users.id,
      userEmail: users.email,
      userEmailCanonical: users.emailCanonical,
      userName: users.name,
      userRole: users.role,
      userMemberId: users.memberId,
      userDisabledAt: users.disabledAt,
      userCreatedAt: users.createdAt,
      userUpdatedAt: users.updatedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  const joined = rows[0];
  if (!joined) return null;

  // Reconstruct the session row shape expected by the rest of this function
  // (same shape as sessions.$inferSelect).
  const row: typeof sessions.$inferSelect = {
    id: joined.sessionId,
    userId: joined.sessionUserId,
    tokenHash: joined.sessionTokenHash,
    issuedAt: joined.sessionIssuedAt,
    lastUsedAt: joined.sessionLastUsedAt,
    expiresAt: joined.sessionExpiresAt,
    revokedAt: joined.sessionRevokedAt,
    deviceFingerprint: joined.sessionDeviceFingerprint,
  };

  const now = Date.now();
  const idleMs = now - row.lastUsedAt.getTime();
  const absMs = now - row.issuedAt.getTime();

  // Idle (7d) + absolute (30d) enforcement (MUST-fix #4) — stays awaited
  // (correctness: must complete before returning null).
  if (
    idleMs > 7 * 86400_000 ||
    absMs > 30 * 86400_000 ||
    row.expiresAt < new Date()
  ) {
    await db.delete(sessions).where(eq(sessions.id, row.id));
    clearSessionCookie(cookies);
    return null;
  }

  // PR1 latency: non-blocking touch — fire-and-forget so the debounced write
  // never gates the first byte. The >60s guard is preserved exactly.
  // Expiry deletes (above) remain awaited; only this benign touch is void'd.
  if (idleMs > 60_000) {
    void db
      .update(sessions)
      .set({ lastUsedAt: new Date() })
      .where(eq(sessions.id, row.id))
      .catch(() => {
        // Swallow — a missed touch means the next request re-touches; idle
        // timeout is still enforced via lastUsedAt from the JOIN read above.
      });
  }

  // Re-check the allowlist on every request, ROLE-AWARE. Without this, revoking
  // access (removing an admin from ADMIN_EMAILS, or deactivating a member) has
  // no effect for up to 30 days (the session absolute lifetime). Original admin
  // check flagged by the 2026-05-19 security review (CRIT-3); the member arm is
  // its S2a analogue. Stays awaited (correctness: must complete before return).
  let revoked: boolean;
  if (joined.userRole === "admin") {
    // Admin path — same condition as the original CRIT-3 re-check.
    revoked = !isAdminEmail(joined.userEmailCanonical);
  } else if (joined.userRole === "member_self_service") {
    // Member path — survives (unlike the old unconditional nuke of every
    // non-admin), but revoked the moment the bound Mitglied is deactivated
    // (past Austritt) or the FK is null. O(1) by member_id.
    revoked =
      !joined.userMemberId || !(await getActiveMemberById(joined.userMemberId));
  } else {
    // Any other role (e.g. steuerberater) has no active allowlist path yet —
    // deny defensively rather than trust a stale row.
    revoked = true;
  }
  if (revoked) {
    // Revocation nukes ALL of the user's sessions by user_id (S2b hygiene) — a
    // revoked account is logged out on every device at once, not just on the
    // device that happened to make this request. The idle/absolute EXPIRY above
    // stays per-row (that's per-session lifetime, not a revocation).
    await db.delete(sessions).where(eq(sessions.userId, row.userId));
    clearSessionCookie(cookies);
    return null;
  }

  return {
    session: row,
    user: {
      id: joined.userId,
      email: joined.userEmail,
      emailCanonical: joined.userEmailCanonical,
      name: joined.userName,
      role: joined.userRole,
      memberId: joined.userMemberId ?? null,
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

  // signOut is invoked even on GET /sign-out from anonymous visitors. Skip
  // the audit row in that case — userId is null, actorKind would mis-label
  // it as "user", and FK actorUserId NULL is fine but the row carries no
  // useful signal.
  if (userId) {
    await logAudit({
      action: "sign_out",
      entityKind: "session",
      entityId: null,
      actorUserId: userId,
      actorKind: "user",
      actorIpPrefix: ipToPrefix(meta.ip),
      payload: {},
    });
  }
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
    actorIpPrefix: ipToPrefix(meta.ip),
    payload: { everywhere: true },
  });
}

// ---------------------------------------------------------------------------
// Check intent cookie (for verify GET page)
// ---------------------------------------------------------------------------

export { checkIntentCookie };
