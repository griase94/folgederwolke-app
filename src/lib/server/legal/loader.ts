/**
 * Legal document loader.
 *
 * Reads versioned markdown files from docs/legal/{kind}-versionen/.
 * The "current" version is the lexicographically last file in the directory
 * (v1.md < v2.md < v10.md — numeric sort by version number).
 *
 * Substitutes `[VEREIN_*]` placeholders against env at load time so the
 * markdown can be edited as a template — without substitution `/impressum`
 * publishes literal `[VEREIN_ADRESSE]` text (§ 5 TMG violation).
 *
 * Returns the substituted markdown string and the version identifier.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "$lib/server/env.js";

export type LegalKind = "datenschutzerklaerung" | "impressum";

export interface LegalDocument {
  /** Version identifier, e.g. "v1" */
  version: string;
  /** Substituted markdown content, ready to render. */
  markdown: string;
}

/**
 * Replace every `[VEREIN_FOO]` token in the markdown with the value of
 * `env.VEREIN_FOO`. Unknown tokens are left untouched so they surface as
 * obvious typos in review rather than silent empty strings.
 */
function substituteVereinPlaceholders(markdown: string): string {
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

/**
 * Resolves the docs/legal directory relative to the project root.
 * Works both in dev (src tree) and after build (bundle in build/).
 */
function legalDir(kind: LegalKind): string {
  // __filename → src/lib/server/legal/loader.ts (dev) or build/... (prod)
  // Walk up to project root by finding the directory that contains "docs/".
  // In practice, process.cwd() is the project root in both vite dev and node build.
  return join(process.cwd(), "docs", "legal", `${kind}-versionen`);
}

/** Numeric-sort: "v10" > "v2" > "v1" */
function versionNumber(stem: string): number {
  const m = stem.match(/^v(\d+)$/);
  return m ? parseInt(m[1]!, 10) : 0;
}

export async function loadCurrentLegalDoc(
  kind: LegalKind,
): Promise<LegalDocument> {
  const dir = legalDir(kind);
  const entries = await readdir(dir);
  const mdFiles = entries
    .filter((f) => f.endsWith(".md"))
    .sort((a, b) => {
      const stemA = a.replace(/\.md$/, "");
      const stemB = b.replace(/\.md$/, "");
      return versionNumber(stemA) - versionNumber(stemB);
    });

  if (mdFiles.length === 0) {
    throw new Error(`No versioned markdown files found in ${dir}`);
  }

  const latest = mdFiles[mdFiles.length - 1]!;
  const version = latest.replace(/\.md$/, "");
  const filePath = join(dir, latest);
  const raw = await readFile(filePath, "utf-8");

  // Strip the HTML comment header (<!-- ... -->) if present at the top
  const stripped = raw.replace(/^<!--[\s\S]*?-->\n*/m, "").trimStart();
  const markdown = substituteVereinPlaceholders(stripped);

  return { version, markdown };
}
