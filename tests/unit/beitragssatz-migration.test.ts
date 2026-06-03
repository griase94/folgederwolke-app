/**
 * Task 1.1: beitragssatz_by_year table — migration + seed verification.
 *
 * Asserts that after migration 0026 the table exists, contains seeded rows
 * for 2020 through current_year+1, and that all have cents = 6969n.
 *
 * @phase-1
 */

import { describe, it, expect } from "vitest";
import { getDb } from "$lib/server/db/index.js";
import { beitragssatzByYear } from "$lib/server/db/schema/beitragssatz.js";
import { asc } from "drizzle-orm";

describe("@phase-1 beitragssatz_by_year migration (Task 1.1)", () => {
  it("seeds all years 2020..currentYear+1 with €69.69", async () => {
    const db = getDb();
    const rows = await db
      .select()
      .from(beitragssatzByYear)
      .orderBy(asc(beitragssatzByYear.year));

    const currentYear = new Date().getFullYear();

    // Must have at least years 2020 through currentYear+1
    expect(rows.length).toBeGreaterThanOrEqual(currentYear + 1 - 2020 + 1);

    const first = rows[0];
    expect(first?.year).toBe(2020);
    expect(rows.at(-1)?.year).toBeGreaterThanOrEqual(currentYear + 1);

    // All seeded rows have the default €69.69
    for (const row of rows) {
      expect(row.cents).toBe(6969n);
    }
  });

  it("has correct decision_note on seeded rows", async () => {
    const db = getDb();
    const [row] = await db
      .select()
      .from(beitragssatzByYear)
      .orderBy(asc(beitragssatzByYear.year))
      .limit(1);

    expect(row?.decisionNote).toBe("Initial migration default (€69,69)");
  });
});
