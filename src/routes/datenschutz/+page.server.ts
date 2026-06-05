import { loadCurrentLegalDoc } from "$lib/server/legal/loader.js";
import { marked } from "marked";
import type { PageServerLoad } from "./$types.js";

// Prerendered to static HTML at build time (see impressum/+page.server.ts):
// no serverless function at request time, so the legal page cannot 500.
export const prerender = true;

export const load: PageServerLoad = async () => {
  const doc = await loadCurrentLegalDoc("datenschutzerklaerung");
  const html = await marked.parse(doc.markdown);
  return { version: doc.version, html };
};
