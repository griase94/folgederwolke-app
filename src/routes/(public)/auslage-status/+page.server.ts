/**
 * /auslage-status (index) — the AUS-Nr search entry (Aurora A-flow S1).
 *
 * A GET with ?ausId= (the search form's submit, works without JS) normalises the
 * number and 303-redirects to /auslage-status/[ausId] — the detail route then
 * resolves it, or renders its 404-search via +error.svelte. Without a param the
 * page just renders the empty search.
 */

import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types.js";

export const load: PageServerLoad = ({ url }) => {
  const raw = (url.searchParams.get("ausId") ?? "").trim().toUpperCase();
  if (raw) {
    throw redirect(303, `/auslage-status/${encodeURIComponent(raw)}`);
  }
  return {};
};
