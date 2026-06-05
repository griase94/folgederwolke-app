/**
 * White-label Phase 1 — Task 1.8: seed idempotency + orphan-key removal.
 *
 *  - An admin edit to `verein.name` SURVIVES a re-seed of the Stammdaten keys
 *    (seedVereinStammdatenFromEnv uses onConflictDoNothing).
 *  - The orphan object-keys `verein.stammdaten`, `verein.bankverbindung`,
 *    `verein.mitgliedsbeitrag.default_cents` are NOT present after the full
 *    seed (globalSetup runs scripts/seed.ts once before this suite) — they had
 *    no readers and were removed.
 *
 * Runs in-process against the seeded test DB. We re-use the project's
 * postgres-js connection via getDb() and call the exported seed helper
 * directly so there is no subprocess race with the global DB reset.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { seedVereinStammdatenFromEnv } from "../../scripts/seed.js";

async function getSetting(key: string): Promise<unknown> {
  const rows = (await getDb().execute(
    sql`SELECT value FROM settings WHERE key = ${key}`,
  )) as unknown as ReadonlyArray<{ value: unknown }>;
  return rows[0]?.value;
}

describe("Task 1.8 — seed idempotency + orphan-key removal", () => {
  beforeEach(async () => {
    await getDb().execute(sql`DELETE FROM settings WHERE key = 'verein.name'`);
  });

  afterEach(async () => {
    await getDb().execute(sql`DELETE FROM settings WHERE key = 'verein.name'`);
  });

  it("an admin edit to verein.name survives a re-seed (onConflictDoNothing)", async () => {
    const db = getDb();
    await db.execute(sql`
      INSERT INTO settings (key, value) VALUES ('verein.name', '"Edited Verein e.V."'::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `);

    // Re-seed the Stammdaten keys — the edit must NOT be overwritten.
    await seedVereinStammdatenFromEnv(db as never);

    expect(await getSetting("verein.name")).toBe("Edited Verein e.V.");
  });

  it("the removed orphan object-keys are absent after the full seed", async () => {
    expect(await getSetting("verein.stammdaten")).toBeUndefined();
    expect(await getSetting("verein.bankverbindung")).toBeUndefined();
    expect(
      await getSetting("verein.mitgliedsbeitrag.default_cents"),
    ).toBeUndefined();
  });
});
