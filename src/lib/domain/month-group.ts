/**
 * Month grouping for transaction lists (Aurora slice 5, spec §8).
 *
 * Pure + client-safe. Groups CONSECUTIVE runs of rows sharing a Berlin-local
 * calendar month (the caller passes rows already sorted by its date axis, so
 * runs == months; consecutive-run grouping keeps the function honest if a
 * deep link ever delivers an exotic order). Subtotals are SIGNED integer
 * cents (ADR-0003): per-type pages pass the type-signed amount, the unified
 * feed passes the net signed amount.
 */

const MONTH_NAMES = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
] as const;

const berlinYmFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
});

/**
 * "YYYY-MM" for an ISO date string. Date-only strings (YYYY-MM-DD) are sliced
 * directly (they're already Berlin-local calendar dates — cash dates are SQL
 * `date`s); timestamps go through Intl with Europe/Berlin so a UTC instant
 * near midnight lands in the correct local month (ADR-0001 discipline).
 */
export function berlinMonthKey(iso: string): string {
  if (!iso.includes("T")) return iso.slice(0, 7);
  return berlinYmFmt.format(new Date(iso)).slice(0, 7);
}

/** "März 2026" for "2026-03". */
export function monthLabel(key: string): string {
  const m = Number(key.slice(5, 7));
  const name = MONTH_NAMES[m - 1] ?? key;
  return `${name} ${key.slice(0, 4)}`;
}

export interface MonthBucket<T> {
  key: string;
  label: string;
  rows: T[];
  subtotalCents: number;
}

export function groupByMonth<T>(
  rows: readonly T[],
  dateOf: (row: T) => string,
  signedCentsOf: (row: T) => number,
): MonthBucket<T>[] {
  const buckets: MonthBucket<T>[] = [];
  for (const row of rows) {
    const key = berlinMonthKey(dateOf(row));
    const last = buckets[buckets.length - 1];
    if (last && last.key === key) {
      last.rows.push(row);
      last.subtotalCents += signedCentsOf(row);
    } else {
      buckets.push({
        key,
        label: monthLabel(key),
        rows: [row],
        subtotalCents: signedCentsOf(row),
      });
    }
  }
  return buckets;
}
