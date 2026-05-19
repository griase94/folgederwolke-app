import { loadCurrentLegalDoc } from "$lib/server/legal/loader.js";
import { marked } from "marked";
import type { PageServerLoad } from "./$types.js";

export const prerender = false;

export const load: PageServerLoad = async () => {
  const doc = await loadCurrentLegalDoc("datenschutzerklaerung");
  const html = await marked.parse(doc.markdown);
  return { version: doc.version, html };
};
