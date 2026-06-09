/**
 * Beitragssatz lookup helpers (Task 1.5).
 *
 * Read-only helpers for looking up the per-year Beitragssatz (membership fee)
 * and Fälligkeitsdatum (due date) from the beitragssatz_by_year table.
 *
 * Throws an explicit error if the year has no row — callers must ensure the
 * seed migration has run (migration 0026 backfills 2020→currentYear+1).
 *
 * ADR-0003: returns bigint cents, never floats.
 */

import { eq } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { beitragssatzByYear } from "$lib/server/db/schema/beitragssatz.js";

/**
 * Returns the Beitragssatz in euro cents for the given year, or `null` when
 * no row exists. Prefer this in action paths so a missing Satz becomes a
 * user-facing 422 (see members-actions.ts) instead of an uncaught 500.
 */
export async function findBeitragssatz(year: number): Promise<bigint | null> {
  const db = getDb();
  const [row] = await db
    .select({ cents: beitragssatzByYear.cents })
    .from(beitragssatzByYear)
    .where(eq(beitragssatzByYear.year, year))
    .limit(1);

  return row?.cents ?? null;
}

/**
 * Returns the Beitragssatz in euro cents for the given year.
 * Throws if no row exists for the year.
 */
export async function getBeitragssatz(year: number): Promise<bigint> {
  const cents = await findBeitragssatz(year);

  if (cents === null) {
    throw new Error(`No Beitragssatz for year ${year}`);
  }

  return cents;
}

/**
 * Returns the Fälligkeitsdatum for the given year.
 * Falls back to March 31 of the year when faelligkeit_at is null.
 * Throws if no row exists for the year.
 */
export async function getFaelligkeit(year: number): Promise<Date> {
  const db = getDb();
  const [row] = await db
    .select({ faelligkeitAt: beitragssatzByYear.faelligkeitAt })
    .from(beitragssatzByYear)
    .where(eq(beitragssatzByYear.year, year))
    .limit(1);

  if (!row) {
    throw new Error(`No Beitragssatz for year ${year}`);
  }

  if (row.faelligkeitAt) {
    // Drizzle returns date columns as strings in "YYYY-MM-DD" format.
    // Parse in UTC to avoid timezone shifts.
    return new Date(`${row.faelligkeitAt}T00:00:00Z`);
  }

  // Default: March 31 of the year
  return new Date(`${year}-03-31T00:00:00Z`);
}
