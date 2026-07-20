import { dev } from "$app/environment";
import { error } from "@sveltejs/kit";
import type { PageLoad } from "./$types.js";

/**
 * Dev-only dataviz gallery — the standing visual tool for the chart family.
 * 404s outside a non-production build so it never ships to prod users.
 */
export const load: PageLoad = () => {
  if (!dev) throw error(404, "Not found");
  return {};
};
