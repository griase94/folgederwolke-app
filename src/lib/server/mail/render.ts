/**
 * Svelte SSR → HTML + plain-text mail renderer.
 *
 * Uses svelte/server `render()` to SSR a Svelte component into an HTML string,
 * then derives a plain-text fallback by stripping tags and normalising
 * whitespace. No external CSS or remote resources — all styles must be inline
 * in the templates.
 */

import { render as svelteRender } from "svelte/server";
import type { Component } from "svelte";
import { INK_700, PAGE_BG } from "./templates/kit/tokens.js";

export interface RenderedMail {
  html: string;
  text: string;
}

/**
 * Render a Svelte component with the given props to HTML + plain text.
 *
 * @param component — a Svelte 5 component (server-side).
 * @param props — typed props for the component.
 */
export function renderMailTemplate(
  component: Component,
  props: Record<string, unknown>,
): RenderedMail {
  const { body } = svelteRender(component, { props });
  // Wrap the component's body (which renders only the <table> content, no
  // html/head/body tags) in a full HTML document shell. Email clients need the
  // charset meta and body background colour set here.
  //
  // The ONE embedded stylesheet: on a phone a two-column fact row leaves ~170px
  // for the value, so a long Bezeichnung wraps into a ragged column. Below 480px
  // label and value stack instead. Both rules only RELAX an inline style, so
  // clients that drop <style> keep the desktop table and lose nothing — the
  // inline styles stay authoritative.
  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<style>
@media only screen and (max-width:480px){
.fdw-k,.fdw-v{display:block!important;width:auto!important;text-align:left!important}
.fdw-k{padding:6px 0 0 0!important}
.fdw-v{padding:1px 0 6px 0!important}
}
</style>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${INK_700};">
${body}
</body>
</html>`;
  const text = htmlToPlainText(html);
  return { html, text };
}

/**
 * Strip HTML tags and collapse whitespace into a readable plain-text string.
 * Good enough for a plain-text mail part; no need for a full parser.
 */
function htmlToPlainText(html: string): string {
  return (
    html
      // Drop <style>/<script> bodies first — tag-stripping alone would leave
      // their CONTENT behind, i.e. raw CSS in the plain-text part.
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      // Replace block-level line breaks with newlines
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|tr|td|th|li|h[1-6]|blockquote|table)>/gi, "\n")
      // Remove all remaining tags
      .replace(/<[^>]+>/g, "")
      // Decode common HTML entities
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&nbsp;/g, " ")
      // Collapse runs of whitespace / blank lines (max 2 consecutive newlines)
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
