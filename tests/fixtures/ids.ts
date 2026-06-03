/**
 * Test fixture IDs for Phase 0+ tests.
 *
 * Members and users have DB-generated random UUIDs, so we cannot use
 * static constants. Instead, this module exports fetch-based helpers that
 * look up the test DB once and cache the result. The DB must have been
 * reset (vitest-global-setup) before any helper is called.
 *
 * User accounts are created lazily by the auth flow on first magic-link
 * verify. For unit tests that mock the DB, use the placeholder constants
 * below as stand-in values — they are recognisable as test data.
 */

// ---------------------------------------------------------------------------
// Placeholder constants for mocked-DB unit tests (Tasks 0.1, 0.2)
// ---------------------------------------------------------------------------

/** Sentinel UUID used in mocked-DB unit tests only. Never in real DB. */
export const ADMIN_USER_ID_MOCK = "00000000-0000-4000-8000-000000000001";
export const STEUERBERATER_USER_ID_MOCK =
  "00000000-0000-4000-8000-000000000002";
export const MEMBER_SELF_SERVICE_USER_ID_MOCK =
  "00000000-0000-4000-8000-000000000003";
export const TEST_MEMBER_ID_MOCK = "10000000-0000-4000-8000-000000000001";

// ---------------------------------------------------------------------------
// Live-DB fetch helpers (integration + e2e tests)
// ---------------------------------------------------------------------------

let _cachedMemberId: string | null = null;

/**
 * Returns the ID of the first fixture member in the test DB.
 * Suitable for unit/integration tests that touch a real DB connection.
 */
export async function getTestMemberId(): Promise<string> {
  if (_cachedMemberId) return _cachedMemberId;
  const { getDb } = await import("$lib/server/db/index.js");
  const { members } = await import("$lib/server/db/schema/members.js");
  const { eq } = await import("drizzle-orm");
  const db = getDb();
  const rows = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.isFixture, true))
    .limit(1);
  if (!rows[0]) throw new Error("No fixture member found in test DB");
  _cachedMemberId = rows[0].id;
  return _cachedMemberId;
}
