// @vitest-environment node
/**
 * Aurora slice 2 — Prüfung tab badge count (spec §5).
 * countOpenAuslagen() must equal the DB truth for the SAME predicate the
 * dashboard KPI uses (decided_at IS NULL) — tab badge and dashboard task
 * row can never disagree.
 */
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "../../src/lib/server/db/index.js";
import { countOpenAuslagen } from "../../src/lib/server/domain/inbox-count.js";

describe("countOpenAuslagen (Prüfung badge source)", () => {
  it("returns the number of undecided auslagen_submissions", async () => {
    const db = getDb();
    const rows = await db.execute<{ c: number }>(
      sql`SELECT count(*)::int AS c FROM auslagen_submissions WHERE decided_at IS NULL`,
    );
    const expected = Number((rows as { c: number }[])[0]?.c ?? 0);
    await expect(countOpenAuslagen()).resolves.toBe(expected);
  });

  it("returns a non-negative integer", async () => {
    const n = await countOpenAuslagen();
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(0);
  });
});
