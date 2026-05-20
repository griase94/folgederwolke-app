/**
 * Pure helpers for the dashboard cashflow overview (C3, cycle 2 cleanup).
 *
 * Moved here from `$lib/server/domain/dashboard.ts` so that both the
 * server-side query layer AND the client-side Svelte components can
 * import without dragging server-only modules (Drizzle, db) into the
 * client bundle.
 *
 * Used by:
 *   - LargeKpiCard.svelte (LY-delta chip)
 *   - dashboard.ts (Drizzle row → length-12 array)
 *   - CashflowOverviewSection.svelte (current-year sparkline clamping)
 */

/**
 * Year-over-year percentage delta of `cur` vs `prev`, rounded to nearest int.
 * Returns null when `prev` is non-positive (defensive — no signal to convey).
 */
export function computeLyDeltaPct(cur: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

/**
 * Reduce `(month, sumCents)` rows into a length-12 array, 0-indexed (Jan=0).
 * Tolerates bigint / string sums returned by Postgres' SUM().
 */
export function bucketByMonth(
  rows: ReadonlyArray<{
    month: number | string | bigint | null;
    sumCents: number | string | bigint | null;
  }>,
): number[] {
  const out = new Array<number>(12).fill(0);
  for (const r of rows) {
    if (r.month === null || r.month === undefined) continue;
    const m = Number(r.month);
    if (!Number.isFinite(m) || m < 1 || m > 12) continue;
    const v = Number(r.sumCents ?? 0);
    if (!Number.isFinite(v)) continue;
    out[m - 1]! += v;
  }
  return out;
}

/**
 * C3-5 (cycle 2): for the current Berlin year, clamp the monthly cents
 * series to months that have already happened. Sparkline normalization
 * over a series that's mostly trailing zeros makes Apr-Dec look like a
 * "crash" against the early-year peak; clipping to the YTD window avoids
 * this artifact.
 *
 * @param data            length-12 monthly cents (Jan=0 .. Dec=11)
 * @param selectedYear    The fiscal year the dashboard is scoped to
 * @param currentYear     Today's Berlin year (passed in for testability)
 * @param currentMonth    Today's Berlin month, 1..12 (passed in for testability)
 * @returns The same array for past years; a trimmed slice (1..currentMonth)
 *          for the current year. Always at least 1 element.
 */
export function clampMonthlyForCurrentYear(
  data: number[],
  selectedYear: number,
  currentYear: number,
  currentMonth: number,
): number[] {
  if (selectedYear !== currentYear) return data;
  const m = Math.min(Math.max(1, currentMonth), 12);
  return data.slice(0, m);
}
