import { loadCurrentLegalDoc } from "$lib/server/legal/loader.js";
import { marked } from "marked";
import type { PageServerLoad } from "./$types.js";

// Prerendered to static HTML at build time: the page is pure (legal markdown +
// build-time env substitution), so no serverless function runs at request time —
// which is what previously 500'd (the loader read docs/ from disk, absent in the
// Vercel function). readStammdaten is build-safe (env fallback during `building`).
export const prerender = true;

export const load: PageServerLoad = async () => {
  const doc = await loadCurrentLegalDoc("impressum");
  const html = await marked.parse(doc.markdown);
  return { version: doc.version, html };
};
