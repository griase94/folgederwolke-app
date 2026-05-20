/**
 * /app/jahresabschluss/[year]/+layout.server.ts
 *
 * Shared loader for the C1 tabbed EÜR workspace. Loads the full workspace
 * payload (Übersicht stats, sphere YoY, monthly trend, WGB status, pre-flight
 * checklist) and exposes it to every tab (Übersicht, Buchungsliste, Spenden,
 * Exports) via SvelteKit's layout-data inheritance.
 *
 * Festschreibung is handled by the tab-local +page.server.ts (Übersicht).
 */

import { error } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types.js";
import { loadEurWorkspaceData } from "$lib/server/eur/load.js";

export const load: LayoutServerLoad = async ({ params }) => {
  const year = parseInt(params.year, 10);
  if (!Number.isFinite(year) || year < 2020 || year > 2100) {
    throw error(400, `Ungültiges Jahr: ${params.year}`);
  }

  return await loadEurWorkspaceData(year);
};
