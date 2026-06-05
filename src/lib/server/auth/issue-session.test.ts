/**
 * Integration test for `issueSession` — verifies the extracted helper inserts
 * a `sessions` row with the correct hash, TTL, and returns the raw token.
 *
 * Runs against the same hermetic Postgres set up by tests/vitest-global-setup.ts
 * (port 15432, `app_runtime` LOGIN). The test seeds its own user so it is not
 * coupled to the standard fixture set.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { sessions, users } from "$lib/server/db/schema/users.js";
import { sha256 } from "./hash.js";
import { issueSession } from "./index.js";

const TEST_EMAIL = "issue-session-test@example.com";

describe("issueSession", () => {
  let userId: string;

  beforeAll(async () => {
    const db = getDb();
    const inserted = await db
      .insert(users)
      .values({
        email: TEST_EMAIL,
        emailCanonical: TEST_EMAIL,
        role: "admin",
      })
      .onConflictDoUpdate({
        target: users.emailCanonical,
        set: { updatedAt: new Date() },
      })
      .returning();
    userId = inserted[0]!.id;
  });

  afterAll(async () => {
    const db = getDb();
    // Best-effort cleanup so the suite stays hermetic across runs.
    await db.delete(sessions).where(eq(sessions.userId, userId));
    await db.execute(
      sql`DELETE FROM users WHERE email_canonical = ${TEST_EMAIL}`,
    );
  });

  it("returns a base64url token and inserts a hashed row in sessions", async () => {
    const db = getDb();
    const { token } = await issueSession(db, userId);

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const rows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, sha256(token)));

    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(userId);

    const expiresInDays =
      (rows[0]!.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(expiresInDays).toBeGreaterThan(29.5);
    expect(expiresInDays).toBeLessThan(30.5);
  });

  it("works when called with a transaction handle", async () => {
    const db = getDb();
    const result = await db.transaction(async (tx) => {
      return issueSession(tx, userId);
    });

    const rows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, sha256(result.token)));

    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(userId);
  });
});
