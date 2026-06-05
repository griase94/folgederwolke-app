/**
 * Server-side layout year resolver (Phase 3, PAR-05).
 *
 * Named `layout-year.ts` (NOT `years.ts`) to avoid colliding with the existing
 * `years.ts` (available-years query) and the pure client-safe `$lib/domain/year.ts`.
 *
 * The /app layout historically clamped `?year=NNNN` to the nearest available
 * Buchungsjahr (so the switcher always has a checked segment). The three
 * transaction *list* pages additionally need the `ALL_YEARS` ("Alle Jahre")
 * scope to pass through untouched — clamping would silently collapse it to a
 * concrete year. This resolver returns the wider `YearScope`:
 *
 *   - `?year=all`  → `ALL_YEARS` sentinel (no clamping)
 *   - concrete year → `clampYearToAvailable(selectYearFromUrl(...))` (number)
 *   - missing/garbage → `currentYear` (via `selectYearFromUrl` fallback), clamped
 *
 * The layout keeps a separate concrete `selectedYear: number` for existing
 * consumers (dashboard / Mitglieder / EÜR pages + Topbar) — see B1 in the plan.
 */

import {
  ALL_YEARS,
  clampYearToAvailable,
  selectYearFromUrl,
  type YearScope,
} from "$lib/domain/year.js";

/**
 * Resolve the layout-level year scope from the request URL.
 *
 * @param params - the request `URLSearchParams` (reads `?year=`).
 * @param currentYear - Berlin-TZ current Buchungsjahr, used as the fallback.
 * @param availableYearNumbers - Buchungsjahre present in the data, for clamping.
 *   Empty is a pass-through (matches `clampYearToAvailable`'s contract).
 *
 * @see selectYearOrAllFromUrl — the client-safe sibling. This resolver differs
 *   by additionally clamping concrete years to `availableYearNumbers`.
 */
export function resolveLayoutYear(
  params: URLSearchParams,
  currentYear: number,
  availableYearNumbers: readonly number[],
): YearScope {
  if (params.get("year") === ALL_YEARS) return ALL_YEARS;
  return clampYearToAvailable(
    selectYearFromUrl(params, currentYear),
    availableYearNumbers,
  );
}
