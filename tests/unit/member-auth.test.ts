/**
 * Member self-service auth — role-aware magic-link (Aurora A-flow S2a).
 *
 * DB-backed integration: exercises the REAL issue / consume / resolveSession
 * code against the live test DB (NO mocks). This is the load-bearing evidence
 * for the auth board — it proves the four security properties end-to-end:
 *   - anti-enumeration: a link is issued for members, no-op'd for strangers;
 *   - auto-provision: first member sign-in mints a member_self_service user
 *     bound to the correct member_id, second sign-in does not duplicate it;
 *   - admin precedence + regression: admins stay role='admin' with the same
 *     allowlist re-check;
 *   - allowlist parity: a member session dies the moment the member is
 *     deactivated (the member analogue of the admin CRIT-3 re-check).
 *
 * @vitest-environment node
 * @phase-2
 */

import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import type { Cookies } from "@sveltejs/kit";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { magicLinks, sessions, users } from "$lib/server/db/schema/users.js";
import { members } from "$lib/server/db/schema/members.js";
import { sha256 } from "$lib/server/auth/hash.js";
import { canonicalizeEmail } from "$lib/domain/email.js";
import { registerHandlers } from "$lib/server/events/index.js";
import {
  consumeMagicLink,
  issueMagicLink,
  resolveSession,
} from "$lib/server/auth/index.js";
import {
  findActiveMemberByEmail,
  getActiveMemberById,
} from "$lib/server/auth/member-allowlist.js";

// ---------------------------------------------------------------------------
// Fixtures — unique emails/IPs per call so accumulating rows never collide.
// ---------------------------------------------------------------------------

let seq = 0;
function uniqEmail(local = "member"): string {
  return `${local}-${Date.now()}-${seq++}@portal.test`;
}
function uniqIp(): string {
  return `10.0.${Math.floor(seq / 256) % 256}.${seq++ % 256}`;
}

async function seedMember(opts: {
  email: string | null;
  austrittsDatum?: string | null;
  iban?: string | null;
  /** Store the RAW email in email_canonical too (default: leave NULL to prove
   *  the JS-canonicalization match works without the drift-prone column). */
  emailCanonical?: string | null;
}): Promise<typeof members.$inferSelect> {
  const db = getDb();
  const [row] = await db
    .insert(members)
    .values({
      vorname: "Test",
      nachname: "Member",
      email: opts.email,
      emailCanonical: opts.emailCanonical ?? null,
      iban: opts.iban ?? null,
      eintrittsDatum: "2020-01-01",
      austrittsDatum: opts.austrittsDatum ?? null,
      isFixture: true,
    })
    .returning();
  if (!row) throw new Error("seedMember: no row");
  return row;
}

async function insertMagicLink(canonicalEmail: string): Promise<string> {
  const db = getDb();
  const rawToken = randomBytes(32).toString("base64url");
  await db.insert(magicLinks).values({
    tokenHash: sha256(rawToken),
    emailCanonical: canonicalEmail,
    expiresAt: new Date(Date.now() + 15 * 60_000),
  });
  return rawToken;
}

/** Map-backed Cookies stub — round-trips the signed session cookie so
 *  consumeMagicLink → resolveSession works exactly as in a real request. */
function makeCookies(): Cookies {
  const store = new Map<string, string>();
  return {
    get: (name: string) => store.get(name),
    getAll: () =>
      [...store.entries()].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => {
      store.set(name, value);
    },
    delete: (name: string) => {
      store.delete(name);
    },
    serialize: () => "",
  } as unknown as Cookies;
}

const ADMIN_EMAIL = "admin@example.com"; // matches .env.test ADMIN_EMAILS

// ---------------------------------------------------------------------------
// 1. member-allowlist matching
// ---------------------------------------------------------------------------

describe("@phase-2 member-allowlist matching", () => {
  it("matches an active member by canonicalized email (ignores drifted email_canonical)", async () => {
    const email = uniqEmail();
    const seeded = await seedMember({ email });
    const hit = await findActiveMemberByEmail(canonicalizeEmail(email));
    expect(hit?.id).toBe(seeded.id);
  });

  it("matches through Gmail dot/plus canonicalization", async () => {
    // A Gmail member created with dot-tricks; the magic-link canonical form
    // strips them — matching MUST still succeed (the drift-proof property).
    const raw = `a.b.c+promo-${Date.now()}@gmail.com`;
    const canonical = canonicalizeEmail(raw); // → abc-...@gmail.com w/o +promo
    const seeded = await seedMember({ email: raw });
    const hit = await findActiveMemberByEmail(canonical);
    expect(hit?.id).toBe(seeded.id);
  });

  it("does NOT match a member who has left (past Austritt)", async () => {
    const email = uniqEmail();
    await seedMember({ email, austrittsDatum: "2020-06-30" });
    expect(await findActiveMemberByEmail(canonicalizeEmail(email))).toBeNull();
  });

  it("does NOT match an email-less member", async () => {
    await seedMember({ email: null });
    expect(await findActiveMemberByEmail("nobody@portal.test")).toBeNull();
  });

  it("getActiveMemberById returns null once the member is deactivated", async () => {
    const seeded = await seedMember({ email: uniqEmail() });
    expect((await getActiveMemberById(seeded.id))?.id).toBe(seeded.id);
    await getDb()
      .update(members)
      .set({ austrittsDatum: "2020-01-02" })
      .where(eq(members.id, seeded.id));
    expect(await getActiveMemberById(seeded.id)).toBeNull();
  });

  it("refuses to bind on a canonical-email collision and audits it (Board #163 A-min)", async () => {
    // The bus handler that writes the audit row must be registered.
    registerHandlers();

    // Two distinct raw emails that canonicalize to the SAME address.
    const base = `amb${Date.now()}${seq++}`;
    const canonical = `${base}@gmail.com`;
    const email1 = `${base.slice(0, 2)}.${base.slice(2)}@gmail.com`; // dot → stripped
    const email2 = `${base}+tag@gmail.com`; // +suffix → stripped
    expect(canonicalizeEmail(email1)).toBe(canonical);
    expect(canonicalizeEmail(email2)).toBe(canonical);

    await seedMember({ email: email1 });
    await seedMember({ email: email2 });

    // Ambiguous → refuse to bind (no arbitrary heap-order pick).
    expect(await findActiveMemberByEmail(canonical)).toBeNull();

    // …and the collision is recorded for an admin to disambiguate.
    const rows = (await getDb().execute(sql`
      SELECT 1 FROM audit_log
       WHERE payload->>'reason' = 'AMBIGUOUS_MEMBER_MATCH'
         AND payload->>'canonicalEmail' = ${canonical}
       LIMIT 1
    `)) as unknown as unknown[];
    expect(rows.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 2. issueMagicLink — anti-enumeration parity across both allowlists
// ---------------------------------------------------------------------------

describe("@phase-2 issueMagicLink role-aware", () => {
  it("issues a real link for an active member", async () => {
    const email = uniqEmail();
    await seedMember({ email });
    const canonical = canonicalizeEmail(email);

    const res = await issueMagicLink(
      email,
      { ip: uniqIp(), ua: "vitest", origin: "http://localhost" },
      makeCookies(),
    );
    expect(res).toEqual({ ok: true, message: expect.any(String) });

    const links = await getDb()
      .select({ id: magicLinks.id })
      .from(magicLinks)
      .where(eq(magicLinks.emailCanonical, canonical));
    expect(links.length).toBe(1);
  });

  it("no-ops (no link row) for a stranger — identical response", async () => {
    const email = uniqEmail("stranger");
    const canonical = canonicalizeEmail(email);

    const res = await issueMagicLink(
      email,
      { ip: uniqIp(), ua: "vitest", origin: "http://localhost" },
      makeCookies(),
    );
    // Response is byte-identical to the member path (anti-enumeration).
    expect(res).toEqual({ ok: true, message: expect.any(String) });

    const links = await getDb()
      .select({ id: magicLinks.id })
      .from(magicLinks)
      .where(eq(magicLinks.emailCanonical, canonical));
    expect(links.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. consumeMagicLink — role resolution + auto-provision
// ---------------------------------------------------------------------------

describe("@phase-2 consumeMagicLink role resolution", () => {
  it("auto-provisions a member_self_service user bound to member_id; second sign-in does not duplicate", async () => {
    const email = uniqEmail();
    const canonical = canonicalizeEmail(email);
    const member = await seedMember({
      email,
      iban: "DE00 0000 0000 0000 0000 00",
    });

    const token1 = await insertMagicLink(canonical);
    const r1 = await consumeMagicLink(
      token1,
      { ip: uniqIp(), ua: "vitest" },
      makeCookies(),
    );
    expect(r1).toEqual({
      ok: true,
      email: canonical,
      role: "member_self_service",
    });

    const afterFirst = await getDb()
      .select()
      .from(users)
      .where(eq(users.emailCanonical, canonical));
    expect(afterFirst.length).toBe(1);
    expect(afterFirst[0]!.role).toBe("member_self_service");
    expect(afterFirst[0]!.memberId).toBe(member.id);

    // Second sign-in (fresh link) — same user row, no duplicate.
    const token2 = await insertMagicLink(canonical);
    const r2 = await consumeMagicLink(
      token2,
      { ip: uniqIp(), ua: "vitest" },
      makeCookies(),
    );
    expect(r2.ok).toBe(true);
    const afterSecond = await getDb()
      .select()
      .from(users)
      .where(eq(users.emailCanonical, canonical));
    expect(afterSecond.length).toBe(1);
    expect(afterSecond[0]!.id).toBe(afterFirst[0]!.id);
  });

  it("resolves an admin email to role='admin' with member_id NULL (regression)", async () => {
    const token = await insertMagicLink(ADMIN_EMAIL);
    const r = await consumeMagicLink(
      token,
      { ip: uniqIp(), ua: "vitest" },
      makeCookies(),
    );
    expect(r).toEqual({ ok: true, email: ADMIN_EMAIL, role: "admin" });
    const row = await getDb()
      .select()
      .from(users)
      .where(eq(users.emailCanonical, ADMIN_EMAIL));
    expect(row[0]!.role).toBe("admin");
    expect(row[0]!.memberId).toBeNull();
  });

  it("rejects a stranger (no member, not admin) as NOT_ELIGIBLE and creates no user", async () => {
    const email = uniqEmail("stranger");
    const canonical = canonicalizeEmail(email);
    const token = await insertMagicLink(canonical);
    const r = await consumeMagicLink(
      token,
      { ip: uniqIp(), ua: "vitest" },
      makeCookies(),
    );
    expect(r).toEqual({ ok: false, reason: "NOT_ELIGIBLE" });
    const row = await getDb()
      .select()
      .from(users)
      .where(eq(users.emailCanonical, canonical));
    expect(row.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. resolveSession — member survives; nuked on deactivation; admin regression
// ---------------------------------------------------------------------------

describe("@phase-2 resolveSession role-aware", () => {
  it("resolves a member session, then nukes it once the member is deactivated", async () => {
    const email = uniqEmail();
    const canonical = canonicalizeEmail(email);
    const member = await seedMember({ email });
    const cookies = makeCookies();

    const token = await insertMagicLink(canonical);
    await consumeMagicLink(token, { ip: uniqIp(), ua: "vitest" }, cookies);

    // Member session survives (the old code nuked EVERY non-admin here).
    const resolved = await resolveSession(cookies);
    expect(resolved?.user.role).toBe("member_self_service");
    expect(resolved?.user.memberId).toBe(member.id);

    // Deactivate the member → next resolve revokes the live session.
    await getDb()
      .update(members)
      .set({ austrittsDatum: "2020-01-02" })
      .where(eq(members.id, member.id));

    const afterDeactivate = await resolveSession(cookies);
    expect(afterDeactivate).toBeNull();
    const remaining = await getDb()
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.userId, resolved!.user.id)));
    expect(remaining.length).toBe(0);
  });

  it("nukes EVERY session of a deactivated member, not just the one resolving", async () => {
    const email = uniqEmail();
    const canonical = canonicalizeEmail(email);
    const member = await seedMember({ email });

    // Two live logins for the SAME member — e.g. phone and laptop.
    const phone = makeCookies();
    const laptop = makeCookies();
    await consumeMagicLink(
      await insertMagicLink(canonical),
      { ip: uniqIp(), ua: "vitest-phone" },
      phone,
    );
    await consumeMagicLink(
      await insertMagicLink(canonical),
      { ip: uniqIp(), ua: "vitest-laptop" },
      laptop,
    );

    const onPhone = await resolveSession(phone);
    expect(onPhone?.user.memberId).toBe(member.id);
    expect((await resolveSession(laptop))?.user.memberId).toBe(member.id);

    const userId = onPhone!.user.id;
    expect(
      (
        await getDb()
          .select({ id: sessions.id })
          .from(sessions)
          .where(eq(sessions.userId, userId))
      ).length,
    ).toBe(2);

    await getDb()
      .update(members)
      .set({ austrittsDatum: "2020-01-02" })
      .where(eq(members.id, member.id));

    // Resolving on ONE device revokes the member's sessions per USER, not per
    // row — the other device must not stay signed in.
    expect(await resolveSession(phone)).toBeNull();
    expect(await resolveSession(laptop)).toBeNull();
    expect(
      (
        await getDb()
          .select({ id: sessions.id })
          .from(sessions)
          .where(eq(sessions.userId, userId))
      ).length,
    ).toBe(0);
  });

  it("resolves an admin session (regression: admin path unchanged)", async () => {
    const cookies = makeCookies();
    const token = await insertMagicLink(ADMIN_EMAIL);
    await consumeMagicLink(token, { ip: uniqIp(), ua: "vitest" }, cookies);
    const resolved = await resolveSession(cookies);
    expect(resolved?.user.role).toBe("admin");
    expect(resolved?.user.memberId).toBeNull();
  });
});
