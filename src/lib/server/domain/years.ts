/**
 * C2 — Server-side Buchungsjahr discovery for the global year switcher.
 *
 * Powers `Topbar.svelte` / `YearSwitcher.svelte` via the `/app/+layout.server.ts`
 * load: the topbar needs the list of switchable years and which of them are
 * locked (festgeschrieben).
 *
 * Source of truth for the "available years" set:
 *   1. Every distinct `year_of_buchung` from income, expenses, donations and
 *      invoices (STORED generated columns, ADR-0001).
 *   2. The current Berlin-TZ Buchungsjahr (`yearForBooking(new Date())`),
 *      always included so a freshly-seeded DB still shows the year switcher.
 *   3. Every year up to `settings.festgeschrieben_bis` (inclusive), so the
 *      switcher can surface a closed year even when no bookings exist for it
 *      (covers ADR-0006 lock-icon UX — JB-003 showed the inverse: 0/null bis
 *      was being interpreted as "everything closed").
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

  // Surface every closed year even when no bookings exist for it, so the
  // switcher can show the lock-icon UX. Cap at festBis - 4 lookback to avoid
  // exploding the dropdown on first-time setups (covers prior 4 years).
  if (festBis !== null && Number.isFinite(festBis)) {
    const lowerBound = festBis - 3;
    for (let y = lowerBound; y <= festBis; y += 1) {
      if (y > 0) yearSet.add(y);
    }
  }

  const out: AvailableYear[] = [];
  for (const year of yearSet) {
    const closed = festBis !== null && year <= festBis;
    out.push({ year, closed });
  }
  out.sort((a, b) => b.year - a.year);
  return out;
}
