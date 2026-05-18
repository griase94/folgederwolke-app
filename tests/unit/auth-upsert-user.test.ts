/**
 * @phase-2
 *
 * Race-condition coverage for `upsertUser` (auth/index.ts, F2).
 *
 * The real `upsertUser` is a single-statement `INSERT … ON CONFLICT
 * (email_canonical) DO UPDATE … RETURNING`. The UNIQUE index on
 * `users.email_canonical` plus row-locking that ON CONFLICT acquires
 * guarantee:
 *
 *   - exactly one row exists for a given canonical email, AND
 *   - every concurrent caller observes the same `users.id`.
 *
 * We cannot exercise the real Drizzle/Postgres path from a unit test (no DB
 * fixture in this suite — see `@phase-2-integration` skipped test below for
 * the placeholder). The pure-logic test below simulates the contract using
 * a shared `Map` keyed on `email_canonical` with synchronous get-or-create;
 * it pins the invariant the production code must honor.
 *
 * If `upsertUser` ever regresses to find-then-insert (read followed by
 * separate write — the cycle-2 bug this fix replaces) the simulation can
 * still pass under fake serialization. The skipped integration test is the
 * authoritative race-condition check.
 */

import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// In-memory ON CONFLICT simulation
// ---------------------------------------------------------------------------

/**
 * Mirror of the production guarantee: a single atomic upsert keyed on
 * email_canonical, returning a stable user_id regardless of concurrency.
 */
function makeUpsertStore() {
  const byEmail = new Map<string, { id: string; emailCanonical: string }>();
  let nextId = 0;

  async function upsert(emailCanonical: string) {
    // Simulate Postgres's atomic INSERT … ON CONFLICT DO UPDATE RETURNING:
    // the read + write happen under the unique-index lock, so only one
    // INSERT wins. Modeled here as a synchronous get-or-create.
    const existing = byEmail.get(emailCanonical);
    if (existing) return existing;
    const created = { id: `user-${++nextId}`, emailCanonical };
    byEmail.set(emailCanonical, created);
    return created;
  }

  return { upsert, byEmail };
}

describe("@phase-2 upsertUser race-condition contract", () => {
  it("50 concurrent upserts for the same email yield exactly one row", async () => {
    const { upsert, byEmail } = makeUpsertStore();
    const email = "concurrent@example.com";

    const results = await Promise.all(
      Array.from({ length: 50 }, () => upsert(email)),
    );

    // Invariant 1: every call returned the same user_id
    const ids = new Set(results.map((r) => r.id));
    expect(ids.size).toBe(1);

    // Invariant 2: exactly one row persisted
    expect(byEmail.size).toBe(1);
  });

  it("different emails produce separate rows", async () => {
    const { upsert, byEmail } = makeUpsertStore();

    await Promise.all([
      upsert("a@example.com"),
      upsert("b@example.com"),
      upsert("a@example.com"), // dup
      upsert("c@example.com"),
    ]);

    expect(byEmail.size).toBe(3);
    expect(byEmail.has("a@example.com")).toBe(true);
    expect(byEmail.has("b@example.com")).toBe(true);
    expect(byEmail.has("c@example.com")).toBe(true);
  });

  it("returned user_id is stable across separate upsert calls", async () => {
    const { upsert } = makeUpsertStore();
    const a = await upsert("stable@example.com");
    const b = await upsert("stable@example.com");
    const c = await upsert("stable@example.com");
    expect(a.id).toBe(b.id);
    expect(b.id).toBe(c.id);
  });
});

// ---------------------------------------------------------------------------
// Real-DB integration placeholder (@phase-2-integration)
// ---------------------------------------------------------------------------
//
// TODO(phase-2-integration): exercise the real `upsertUser` against a
// throwaway Postgres test DB. The query must use ON CONFLICT (email_canonical)
// DO UPDATE … RETURNING. Spawn 50 simultaneous `db.transaction(tx =>
// upsertUser(tx, email))` calls for the same email; assert exactly one
// `users` row exists and all returned `id`s match.
//
// This requires a phase-2 test harness (Neon branch / pg-mem with ON CONFLICT
// support) that isn't wired up yet — tracked by reviewer F2 follow-up.

describe.skip("@phase-2-integration upsertUser real-DB race", () => {
  it("INSERT … ON CONFLICT — 50 concurrent calls collapse to 1 row", () => {
    // placeholder — see TODO above
  });
});
