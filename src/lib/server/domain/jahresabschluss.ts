/**
 * Jahresabschluss domain — Festschreibung action.
 *
 * Calls the SQL function `close_buchhaltungsjahr(year, actor_id)` from
 * Phase 1 (drizzle/sql/close_buchhaltungsjahr.sql). Idempotent: re-running
 * for an already-closed year returns zeros without error.
 */

import { sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";

export interface FestschreibungResult {
  year: number;
  rowsByTable: Record<string, number>;
  totalRows: number;
}

/**
 * Festschreibung: atomically marks all expense/income/donation/invoice rows
 * for the given year as festgeschrieben. Returns row counts per table.
 *
 * @param year    Buchungsjahr to close (2020 ≤ year ≤ current year)
 * @param actorId UUID of the user performing the action (for audit trail)
 */
export async function closeBuchhaltungsjahr(
  year: number,
  actorId: string,
): Promise<FestschreibungResult> {
  const db = getDb();

  const rows = await db.execute<{
    table_name: string;
    rows_festgeschrieben: string;
  }>(
    sql`SELECT table_name, rows_festgeschrieben FROM close_buchhaltungsjahr(${year}, ${actorId}::uuid)`,
  );

  const rowsByTable: Record<string, number> = {};
  let totalRows = 0;
  for (const row of rows) {
    const n = Number(row.rows_festgeschrieben);
    rowsByTable[row.table_name] = n;
    totalRows += n;
  }

  return { year, rowsByTable, totalRows };
}

/**
 * Check whether a year is already fully festgeschrieben.
 * A year is considered closed when no rows for that year have a null
 * festgeschrieben_at across expenses, income, donations, and invoices.
 */
export async function isYearClosed(year: number): Promise<boolean> {
  const db = getDb();
  const result = await db.execute<{ open_count: string }>(sql`
    SELECT (
      (SELECT count(*) FROM expenses WHERE year_of_buchung = ${year} AND festgeschrieben_at IS NULL) +
      (SELECT count(*) FROM income  WHERE year_of_buchung = ${year} AND festgeschrieben_at IS NULL) +
      (SELECT count(*) FROM donations WHERE year_of_buchung = ${year} AND festgeschrieben_at IS NULL)
    ) AS open_count
  `);
  const openCount = Number(result[0]?.open_count ?? 0);
  return openCount === 0;
}
