/**
 * /app layout server load — passes the authenticated user and the global
 * year-switcher context to every /app/* page.
 *
 * Year context (C2 — Wave 2, 2026-05-20):
 *   - `availableYears`     — every Buchungsjahr the user may switch into
 *                            (newest first), each annotated with `closed`
 *                            per settings.festgeschrieben_bis.
 *   - `yearScope`          — the wider `YearScope` (`number | ALL_YEARS`). The
 *                            three transaction *list* pages read this so the
 *                            "Alle Jahre" (`?year=all`) scope survives (B1).
 *   - `selectedYear`       — a *concrete* `number`: `yearScope` collapsed to the
 *                            current Buchungsjahr when "Alle Jahre". Existing
 *                            dashboard/Mitglieder/EÜR pages + the switcher
 *                            highlight read this via `data.selectedYear`.
 *   - `currentYear`        — Berlin-TZ current Buchungsjahr (default selection).
 *   - `festgeschriebenBis` — for downstream gate checks (settings cache).
 *
 * Resolves: VB-002 (no year switching), JB-001 (no global year filter),
 * JB-006 (?year ignored on dashboard), UX-010 (year was implicit).
 *
 * Route protection is handled in hooks.server.ts (redirect to /sign-in
 * if locals.session is null).
 */

import type { LayoutServerLoad } from "./$types.js";
import { sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import {
  listAvailableYears,
  type AvailableYear,
} from "$lib/server/domain/years.js";
import { ALL_YEARS, currentBuchungsjahr } from "$lib/domain/year.js";
import { resolveLayoutYear } from "$lib/server/domain/layout-year.js";
import { countOpenAuslagen } from "$lib/server/domain/inbox-count.js";

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

export const load: LayoutServerLoad = async ({ locals, url }) => {
  // locals.session is guaranteed non-null here because hooks.server.ts
  // redirects unauthenticated requests before this runs.
  const currentYear = currentBuchungsjahr();

  const [availableYears, festgeschriebenBis, openAuslagenCount]: [
    AvailableYear[],
    number | null,
    number,
  ] = await Promise.all([
    listAvailableYears(),
    readFestgeschriebenBis(),
    // Aurora slice 2 (spec §5): Prüfung tab badge — undecided inbox
    // submissions, same predicate as the dashboard task row.
    countOpenAuslagen(),
  ]);

  // Phase 3 (B1): resolve the wider year *scope*. Lists need the `ALL_YEARS`
  // ("Alle Jahre") sentinel to survive — `resolveLayoutYear` passes `?year=all`
  // through untouched and clamps concrete `?year=NNNN` to the nearest available
  // year (so the switcher always has a checked segment). When `availableYears`
  // is empty (fresh DB), the clamp is a pass-through — that matches the helper
  // contract and keeps existing layout-in-empty-fixture tests stable.
  const availableYearNumbers = availableYears.map((y) => y.year);
  const yearScope = resolveLayoutYear(
    url.searchParams,
    currentYear,
    availableYearNumbers,
  );

  // B1: keep a *concrete* `selectedYear: number` for every existing consumer —
  // the switcher highlight + the dashboard/Mitglieder/EÜR pages and `Topbar`
  // read `data.selectedYear` as a plain `number` (`selectedYear!: number`,
  // `=== n` comparisons). When the scope is "Alle Jahre" there is no concrete
  // selection, so fall back to the current Buchungsjahr. Do NOT widen
  // `selectedYear` to `YearScope` — that would break those consumers.
  const selectedYear = yearScope === ALL_YEARS ? currentYear : yearScope;

  return {
    user: locals.session!.user,
    availableYears,
    yearScope,
    selectedYear,
    currentYear,
    festgeschriebenBis,
    openAuslagenCount,
  };
};
