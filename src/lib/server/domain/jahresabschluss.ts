/**
 * Jahresabschluss domain — Festschreibung action.
 *
 * Calls the SQL function `close_buchhaltungsjahr(year, actor_id)` from
 * Phase 1 (drizzle/sql/close_buchhaltungsjahr.sql). Idempotent: re-running
 * for an already-closed year returns zeros without error.
 */

import { sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { berlinYear } from "$lib/domain/year.js";

export interface FestschreibungResult {
  year: number;
  rowsByTable: Record<string, number>;
  totalRows: number;
}

/**
 * Festschreibung: atomically marks all expense/income/donation/invoice rows
 * for the given year as festgeschrieben. Returns row counts per table.
 *
 * @param year    Buchungsjahr to close — must be a PAST year (2020 ≤ year <
 *                current Berlin year). The in-progress (current) year cannot be
 *                closed mid-year; the Jahresabschluss is only possible once the
 *                year has fully ended.
 * @param actorId UUID of the user performing the action (for audit trail)
 */
export async function closeBuchhaltungsjahr(
  year: number,
  actorId: string,
): Promise<FestschreibungResult> {
  // Guardrail (authoritative): never close the current/in-progress year — or a
  // future one. Only past years are closeable. Any caller is protected here.
  const currentYear = berlinYear();
  if (year >= currentYear) {
    throw new Error(
      `Das Jahr ${year} läuft noch — der Jahresabschluss ist erst nach Jahresende (ab ${currentYear === year ? year + 1 : currentYear}) möglich.`,
    );
  }

  const db = getDb();

  // Mark the year's rows festgeschrieben AND advance the canonical close signal
  // `settings.festgeschrieben_bis` in ONE transaction. Without the second step
  // isYearClosed() / the EÜR alreadyClosed guard / the files write-lock all key
  // off festgeschrieben_bis and would NEVER see the year as closed — the index
  // and per-year pages disagreed and the post-close write-lock never armed
  // (deep-verification HIGH). `festgeschrieben_bis` is stored as a jsonb YEAR
  // integer; only ever advance it (never regress a later close).
  const rows = await db.transaction(async (tx) => {
    const r = await tx.execute<{
      table_name: string;
      rows_festgeschrieben: string;
    }>(
      sql`SELECT table_name, rows_festgeschrieben FROM close_buchhaltungsjahr(${year}, ${actorId}::uuid)`,
    );
    await tx.execute(sql`
      INSERT INTO settings (key, value) VALUES ('festgeschrieben_bis', to_jsonb(${year}::int))
      ON CONFLICT (key) DO UPDATE SET value = to_jsonb(${year}::int)
      WHERE settings.value IS NULL OR (settings.value #>> '{}')::int < ${year}
    `);
    return r;
  });

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
 * Check whether `year` is "closed" — i.e. covered by the
 * `settings.festgeschrieben_bis` timestamp.
 *
 * Pre-refactor (C9-JUL-lite, ADR-0006) this counted rows with
 * `festgeschrieben_at IS NULL`, which silently returned `true` for any
 * year that had no bookings at all (zero rows match zero "open" rows).
 * That false-positive hid the "Erste Buchung anlegen" CTA on a never-used
 * 2025 in production. The authoritative signal is
 * `settings.festgeschrieben_bis` — the date up to which the year is locked.
 *
 * `opts.festgeschriebenBis` may be injected by the caller to avoid a
 * round-trip when the value is already in scope (e.g. layout data).
 * `null` is allowed and means "never closed". The value may be either a
 * Date, an epoch-millisecond number, or a year integer (1900..9999) —
 * normalised to the year integer internally.
 */
export async function isYearClosed(
  year: number,
  opts?: { festgeschriebenBis?: Date | number | null },
): Promise<boolean> {
  let fgbValue: Date | number | null | undefined = opts?.festgeschriebenBis;
  if (fgbValue === undefined) {
    const db = getDb();
    const rows = (await db.execute(
      sql`SELECT value FROM settings WHERE key = 'festgeschrieben_bis'`,
    )) as { value: unknown }[];
    const v = rows[0]?.value;
    if (typeof v === "number" && Number.isFinite(v)) fgbValue = v;
    else if (typeof v === "string") {
      const parsed = Number(v.replace(/^"|"$/g, ""));
      fgbValue = Number.isFinite(parsed) ? parsed : null;
    } else fgbValue = null;
  }
  if (fgbValue == null) return false;
  // festgeschriebenBis may be a Date, an epoch year (number 2024), or
  // year-end epoch milliseconds. Normalise to the year integer.
  let closedThroughYear: number;
  if (fgbValue instanceof Date) {
    closedThroughYear = fgbValue.getUTCFullYear();
  } else if (typeof fgbValue === "number") {
    // Heuristic: small numbers (1900..9999) are years; larger numbers are
    // millisecond timestamps. Both forms appear in the codebase historically.
    closedThroughYear =
      fgbValue >= 1900 && fgbValue <= 9999
        ? fgbValue
        : new Date(fgbValue).getUTCFullYear();
  } else {
    return false;
  }
  return year <= closedThroughYear;
}
