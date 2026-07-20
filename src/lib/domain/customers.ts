/**
 * Client-safe Kunden view helpers (no DB, no secrets — importable from
 * components). The server domain (`$lib/server/domain/customers.ts`) owns the
 * Zod schemas + CRUD; these are pure formatting helpers used by the list row
 * and detail head.
 */

/** Human label for an ISO-3166 alpha-2 country code. */
const COUNTRY_LABELS: Record<string, string> = {
  DE: "Deutschland",
  AT: "Österreich",
  CH: "Schweiz",
  FR: "Frankreich",
  IT: "Italien",
  NL: "Niederlande",
  BE: "Belgien",
  LU: "Luxemburg",
  GB: "Vereinigtes Königreich",
  US: "Vereinigte Staaten",
  ES: "Spanien",
};

export function countryLabel(code: string): string {
  return COUNTRY_LABELS[code?.toUpperCase()] ?? code;
}

/**
 * Best-effort "PLZ Ort" for the list subline: the last non-empty line of the
 * address block. A bare country line ("Deutschland") isn't an Ort — prefer the
 * line above it when the last line is a single word without a postal code.
 * Returns null when nothing usable is present.
 */
export function deriveOrt(addressBlock: string | null): string | null {
  if (!addressBlock) return null;
  const lines = addressBlock
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return null;
  const last = lines[lines.length - 1]!;
  const hasPlz = /\d{4,5}/.test(last);
  if (!hasPlz && lines.length >= 2 && /^\p{L}+$/u.test(last)) {
    return lines[lines.length - 2]!;
  }
  return last;
}
