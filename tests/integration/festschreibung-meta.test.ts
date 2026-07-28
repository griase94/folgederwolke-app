// @vitest-environment node
/**
 * Smoke test for readFestschreibungMeta — the „festgeschrieben am · durch wen"
 * meta loader (D-S4). This is RAW SQL (festgeschrieben_at + festgeschrieben_by_user_id
 * across income/expenses/donations JOIN users), so it is NOT type-checked — this
 * test catches a wrong column name by actually running it against the seeded DB.
 * The seed has no festgeschrieben year, so an unclosed year returns nulls; the
 * point is that the query EXECUTES.
 */
import { describe, expect, it } from "vitest";
import { readFestschreibungMeta } from "$lib/server/domain/jahresabschluss.js";

describe("readFestschreibungMeta (raw SQL smoke)", () => {
  it("runs against the schema and returns nulls for an unclosed year", async () => {
    const meta = await readFestschreibungMeta(2020);
    expect(meta).toEqual({ festgeschriebenAm: null, festgeschriebenBy: null });
  });
});
