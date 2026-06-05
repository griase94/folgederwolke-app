/**
 * Legal document loader.
 *
 * The versioned markdown lives in docs/legal/{kind}-versionen/. It is **bundled
 * into the build at compile time** via `import.meta.glob('…?raw', eager)` — NOT
 * read from disk at runtime. The Vercel serverless function does not include the
 * repo's docs/ directory, so the previous `readFile(process.cwd()/docs/…)` threw
 * ENOENT and 500'd /impressum + /datenschutz in production. (It only "worked"
 * under the node adapter used by e2e, where cwd is the project root.) Inlining
 * the markdown as strings makes the content available in every runtime
 * (vite dev, node build, vercel serverless).
 *
 * Substitutes `[VEREIN_*]` placeholders against env at load time so the
 * markdown can be edited as a template — without substitution `/impressum`
 * publishes literal `[VEREIN_ADRESSE]` text (§ 5 TMG violation).
 *
 * Returns the substituted markdown string and the version identifier.
 */

import { env } from "$lib/server/env.js";

export type LegalKind = "datenschutzerklaerung" | "impressum";

export interface LegalDocument {
  /** Version identifier, e.g. "v1" */
  version: string;
  /** Substituted markdown content, ready to render. */
  markdown: string;
}

/**
 * Build-time bundle of every legal markdown file, keyed by its project-root
 * path (e.g. "/docs/legal/impressum-versionen/v1.md"). `eager` + `?raw` inline
 * the file contents into the server bundle as strings, so no filesystem read
 * happens at runtime.
 */
const LEGAL_MARKDOWN = import.meta.glob("/docs/legal/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/**
 * Replace every `[VEREIN_FOO]` token in the markdown with the value of
 * `env.VEREIN_FOO`. Unknown tokens are left untouched so they surface as
 * obvious typos in review rather than silent empty strings. Exported for unit
 * testing of the substitution contract.
 */
export function substituteVereinPlaceholders(markdown: string): string {
  return markdown.replace(/\[(VEREIN_[A-Z0-9_]+)\]/g, (match, key: string) => {
    const value = (env as unknown as Record<string, string | number | boolean>)[
      key
    ];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    // Unknown key or empty value — leave the bracketed token in place so
    // it's visible to reviewers. Empty would silently break legal pages.
    return match;
  });
}

/** Numeric-sort: "v10" > "v2" > "v1" */
function versionNumber(stem: string): number {
  const m = stem.match(/^v(\d+)$/);
  return m ? parseInt(m[1]!, 10) : 0;
}

export async function loadCurrentLegalDoc(
  kind: LegalKind,
): Promise<LegalDocument> {
  const dirFragment = `/docs/legal/${kind}-versionen/`;
  const versions = Object.entries(LEGAL_MARKDOWN)
    .filter(([path]) => path.includes(dirFragment) && path.endsWith(".md"))
    .map(([path, raw]) => {
      const file = path.slice(path.lastIndexOf("/") + 1);
      return { version: file.replace(/\.md$/, ""), raw };
    })
    .sort((a, b) => versionNumber(a.version) - versionNumber(b.version));

  if (versions.length === 0) {
    throw new Error(`No versioned markdown bundled for legal kind "${kind}"`);
  }

  const latest = versions[versions.length - 1]!;

  // Strip the HTML comment header (<!-- ... -->) if present at the top
  const stripped = latest.raw.replace(/^<!--[\s\S]*?-->\n*/m, "").trimStart();
  const markdown = substituteVereinPlaceholders(stripped);

  return { version: latest.version, markdown };
}
