/**
 * C2 — Server-side Buchungsjahr discovery for the global year switcher.
 *
 * Powers `Topbar.svelte` / `YearMenu.svelte` via the `/app/+layout.server.ts`
 * load: the topbar needs the list of switchable years and which of them are
 * locked (festgeschrieben).
 *
 * Source of truth for the "available years" set:
 *   1. Every distinct `year_of_buchung` from income, expenses, donations and
 *      invoices (STORED generated columns, ADR-0001) — years with actual data.
 *   2. The current Berlin-TZ Buchungsjahr (`yearForBooking(new Date())`),
 *      always included so a freshly-seeded DB still shows the year switcher.
 *
 * Note: we deliberately do NOT inflate the list with blank festgeschrieben years
 * that have no booking data. The lock icon + closed annotation is applied to any
 * year <= festgeschrieben_bis that is in the set for other reasons (data or
 * current). This prevents the dropdown from showing empty years like 2021–2024
 * when the user has no entries for those years.
 *
 * The set is then annotated with `closed`:
 *   - settings.festgeschrieben_bis is null  → every year is open.
 *   - settings.festgeschrieben_bis = N      → year <= N is closed (locked).
 *
 * Returns descending (newest first).
 *
 * Resolves: VB-002, JB-001, JB-003, JB-006, UX-010, UI-009.
 */

import { sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { currentBuchungsjahr } from "$lib/domain/year.js";

export interface AvailableYear {
  /** Buchungsjahr (Europe/Berlin), e.g. 2026. */
  year: number;
  /** True iff `year <= settings.festgeschrieben_bis`. */
  closed: boolean;
}

/**
 * Pull `settings.festgeschrieben_bis` and coerce to a number or null.
 *
 * The jsonb value can land as either a JS number, a string-quoted number
 * ("2024"), or absent; we accept all three. Mirrors the
 * `checkFestschreibungGate` / `fetchFestgeschriebenBis` parsers in
 * transactions.ts and members-actions.ts.
 */
async function readFestgeschriebenBis(): Promise<number | null> {
  const db = getDb();
  const rows = await db.execute<{ value: unknown }>(
    sql`SELECT value FROM settings WHERE key = 'festgeschrieben_bis'`,
  );
  const row = (rows as { value: unknown }[])[0];
  if (!row) return null;
  const v = row.value;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const parsed = Number(v.replace(/^"|"$/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * List every Buchungsjahr the user might want to switch into, newest first,
 * annotated with `closed` per ADR-0006.
 *
 * Only years with ≥1 actual booking entry (income/expense/donation/invoice)
 * and the current Buchungsjahr are included. Empty past years are excluded
 * regardless of festgeschrieben_bis — those would only add noise to the
 * dropdown for users who haven't used those years.
 */
export async function listAvailableYears(): Promise<AvailableYear[]> {
  const db = getDb();
  const bookingYears = await db.execute<{ year: number }>(sql`
    SELECT DISTINCT year_of_buchung AS year FROM (
      SELECT year_of_buchung FROM income     WHERE year_of_buchung IS NOT NULL
      UNION
      SELECT year_of_buchung FROM expenses   WHERE year_of_buchung IS NOT NULL
      UNION
      SELECT year_of_buchung FROM donations  WHERE year_of_buchung IS NOT NULL
      UNION
      SELECT year_of_buchung FROM invoices   WHERE year_of_buchung IS NOT NULL
    ) t
    ORDER BY year DESC
  `);

  const festBis = await readFestgeschriebenBis();
  const current = currentBuchungsjahr();

  const yearSet = new Set<number>();
  for (const r of bookingYears as { year: number }[]) {
    const n = Number(r.year);
    if (Number.isFinite(n)) yearSet.add(n);
  }
  // Always include the current Buchungsjahr so a freshly-seeded DB still
  // shows the switcher in a useful state.
  yearSet.add(current);

  // Note: we do NOT add festBis years without data here (old lookback window
  // removed). Empty past years should not clutter the dropdown. Years with
  // actual data already have the closed flag applied below.

  const out: AvailableYear[] = [];
  for (const year of yearSet) {
    const closed = festBis !== null && year <= festBis;
    out.push({ year, closed });
  }
  out.sort((a, b) => b.year - a.year);
  return out;
}
