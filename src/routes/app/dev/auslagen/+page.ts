import { dev } from "$app/environment";
import { error } from "@sveltejs/kit";
import type { PageLoad } from "./$types.js";

/**
 * Dev-only Auslagen-kit gallery — the standing visual tool for the A-flow S1
 * composition primitives. 404s outside a non-production build so it never ships
 * to prod users (the import graph is also DEV-gated in +page.svelte).
 */
export const load: PageLoad = () => {
  if (!dev) throw error(404, "Not found");
  return {};
};
