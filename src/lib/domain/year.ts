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

// ---------------------------------------------------------------------------
// B1 fix (ADR-0001) — Berlin-local date string
// ---------------------------------------------------------------------------

const ymdFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: BERLIN_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Returns the current Europe/Berlin date as an ISO-format string "YYYY-MM-DD".
 *
 * Use this instead of `new Date().toISOString().slice(0, 10)` whenever a
 * date string needs to represent the Berlin-local calendar date. The UTC-slice
 * approach returns the wrong date at 23:01–23:59 CET (= 22:01–22:59 UTC) or
 * 22:01–23:59 CEST during summer time, causing wrong Buchungsjahr assignment
 * (ADR-0001 violation).
 *
 * Accepts an optional `Date` for testability (vi.useFakeTimers-compatible).
 */
export function berlinYmd(d: Date = new Date()): string {
  return ymdFmt.format(d);
}

// ---------------------------------------------------------------------------
// C2 — Global year switcher helpers (VB-002, JB-001, JB-006, UX-010)
// ---------------------------------------------------------------------------

/** Plausible Buchungsjahr range — guards against junk in `?year=` URLs. */
const MIN_YEAR = 2000;
const MAX_YEAR = 2200;

/**
 * Current Buchungsjahr default (Berlin TZ). Alias of `berlinYear()` — kept
 * separately for naming clarity at year-switcher call sites.
 */
export function currentBuchungsjahr(now: Date = new Date()): number {
  return yearForBooking(now);
}

/**
 * Parse a `?year=NNNN` query param to a Buchungsjahr integer, falling back to
 * `fallback` when missing, non-numeric, or outside the plausible range.
 */
export function selectYearFromUrl(
  searchParams: URLSearchParams,
  fallback: number,
): number {
  const raw = searchParams.get("year");
  if (raw === null) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  if (n < MIN_YEAR || n > MAX_YEAR) return fallback;
  return n;
}

/**
 * Coerce a requested year to one present in `available`, choosing the closest
 * representative (largest below, smallest above). Empty `available` is a
 * pass-through — the caller is responsible for seeding it.
 */
export function clampYearToAvailable(
  requested: number,
  available: readonly number[],
): number {
  if (available.length === 0) return requested;
  if (available.includes(requested)) return requested;
  const sorted = [...available].sort((a, b) => a - b);
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  if (requested < min) return min;
  if (requested > max) return max;
  let candidate = min;
  for (const y of sorted) {
    if (y <= requested) candidate = y;
    else break;
  }
  return candidate;
}

// ---------------------------------------------------------------------------
// Phase 2 — "Alle Jahre" year scope + stale-year banner (spec §6)
// ---------------------------------------------------------------------------

/** Sentinel for the list-only "Alle Jahre" scope; serializes to `?year=all`. */
export const ALL_YEARS = "all" as const;
export type YearScope = number | typeof ALL_YEARS;

/** Lists only: accepts ?year=all. Concrete years go through the existing bounds check. */
export function selectYearOrAllFromUrl(
  params: URLSearchParams,
  fallback: number,
): YearScope {
  if (params.get("year") === ALL_YEARS) return ALL_YEARS;
  return selectYearFromUrl(params, fallback);
}

/** Banner trigger: concrete year that isn't the current one. Never for ALL_YEARS. */
export function isStaleYear(scope: YearScope, currentYear: number): boolean {
  return scope !== ALL_YEARS && scope !== currentYear;
}

/**
 * The display label for a year scope: a concrete year as-is, the ALL_YEARS
 * sentinel as "Alle Jahre". SHARED so the three tab KPIs + the list empty-state
 * never drift (Einnahmen previously rendered the sentinel as bare "Alle").
 */
export function yearScopeLabel(scope: YearScope): string {
  return scope === ALL_YEARS ? "Alle Jahre" : String(scope);
}
