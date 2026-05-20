/**
 * /app layout server load — passes the authenticated user and the global
 * year-switcher context to every /app/* page.
 *
 * Year context (C2 — Wave 2, 2026-05-20):
 *   - `availableYears`     — every Buchungsjahr the user may switch into
 *                            (newest first), each annotated with `closed`
 *                            per settings.festgeschrieben_bis.
 *   - `selectedYear`       — derived from `?year=NNNN` with the current
 *                            Buchungsjahr as fallback. List/dashboard pages
 *                            read this via `data.selectedYear`.
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
import {
  currentBuchungsjahr,
  selectYearFromUrl,
} from "$lib/domain/year.js";

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
  const selectedYear = selectYearFromUrl(url.searchParams, currentYear);

  const [availableYears, festgeschriebenBis]: [
    AvailableYear[],
    number | null,
  ] = await Promise.all([listAvailableYears(), readFestgeschriebenBis()]);

  return {
    user: locals.session!.user,
    availableYears,
    selectedYear,
    currentYear,
    festgeschriebenBis,
  };
};
