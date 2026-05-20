/**
 * Year derivation = Buchhaltungsjahr (ADR-0001).
 *
 * The accounting year is derived from `gebucht_am` (the Buchungsdatum), not
 * the calendar year of submission or payment. A receipt submitted Jan 2026
 * for an expense incurred Dec 2025 belongs to Buchhaltungsjahr 2025.
 *
 * SQL mirror: `drizzle/sql/functions/year_for_booking.sql` — IMMUTABLE,
 * Europe/Berlin timezone. STORED generated column `year_of_buchung`.
 */

const BERLIN_TZ = "Europe/Berlin";

/**
 * Pure TS mirror of the SQL `year_for_booking(timestamptz)` function.
 * Used pre-write for hint-display + tests.
 */
export function yearForBooking(gebuchtAm: Date): number {
  // Format date in Berlin TZ and pluck the year. `Intl.DateTimeFormat` is the
  // only stdlib path that supports IANA TZ in pure JS without date-fns-tz.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: BERLIN_TZ,
    year: "numeric",
  });
  const yearStr = fmt.format(gebuchtAm);
  const year = parseInt(yearStr, 10);
  if (!Number.isFinite(year)) {
    throw new Error(
      `yearForBooking: failed to derive year from ${gebuchtAm.toISOString()}`,
    );
  }
  return year;
}

/**
 * Current calendar year as observed in Europe/Berlin. Client-safe — used
 * by the dashboard sparkline clamp helper (C3-5, cycle 2). Server callers
 * should still pass through the API, but this is identical math to
 * `dashboard.berlinYear`.
 */
export function berlinYear(now: Date = new Date()): number {
  return yearForBooking(now);
}
