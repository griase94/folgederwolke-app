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
  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
</head>
<body style="margin:0;padding:0;background:#FCE7F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1F2937;">
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
