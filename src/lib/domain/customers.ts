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

export type StructuredAddress = {
  /** Optional line (z. Hd. / c/o / Gebäude) — DIN 5008, between name + Straße. */
  adresszusatz?: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  /** Optional free-text country line; rendered only when ≠ "Deutschland". */
  land?: string | null;
};

/** Case/whitespace-insensitive "is this the domestic default (Deutschland)?" */
export function isInland(land: string | null | undefined): boolean {
  return (land ?? "").trim().toLowerCase() === "deutschland";
}

/**
 * Assemble the structured address into the multi-line "Briefblock" as it
 * appears on the invoice (DIN 5008 order, below the recipient name):
 *
 *   z. Hd. Frau Müller      ← adresszusatz (optional)
 *   Musterstraße 1          ← strasse
 *   80331 München           ← PLZ Ort
 *   Österreich              ← land (only when ≠ Deutschland)
 *
 * The recipient NAME is deliberately NOT included here — the Rechnung renderer
 * prints it separately, above this block. The result is split back into lines
 * by `addressLines()` (server), so the PDF/mail output stays a clean block.
 * Pure + client-safe: the same helper drives the live modal preview.
 */
export function buildCustomerBriefblock(addr: StructuredAddress): string {
  const lines: string[] = [];
  const zusatz = (addr.adresszusatz ?? "").trim();
  if (zusatz) lines.push(zusatz);
  const strasse = (addr.strasse ?? "").trim();
  if (strasse) lines.push(strasse);
  const plzOrt = [addr.plz, addr.ort]
    .map((s) => (s ?? "").trim())
    .filter((s) => s.length > 0)
    .join(" ");
  if (plzOrt) lines.push(plzOrt);
  const land = (addr.land ?? "").trim();
  if (land && !isInland(land)) lines.push(land);
  return lines.join("\n");
}

/** True when all three structured address parts are present (invoice-ready). */
export function hasCompleteAddress(addr: StructuredAddress): boolean {
  return Boolean(
    (addr.strasse ?? "").trim() &&
    (addr.plz ?? "").trim() &&
    (addr.ort ?? "").trim(),
  );
}

/**
 * Best-effort Ort for the list subline: the city of the last non-empty
 * address line, with the leading postal code dropped (kunden-v5 shows just
 * "München"/"Berlin" — the PLZ made the line truncate on mobile, M2a). A bare
 * country line ("Deutschland") isn't an Ort — step up one. Null when nothing
 * usable is present.
 */
export function deriveOrt(addressBlock: string | null): string | null {
  if (!addressBlock) return null;
  const lines = addressBlock
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return null;
  let ort = lines[lines.length - 1]!;
  const hasPlz = /\d{4,5}/.test(ort);
  // A digit-free last line is a country line (e.g. "Österreich", "Vereinigtes
  // Königreich") — never an Ort in our "PLZ Ort" briefblock — so step up one.
  // Allow spaces/dots/hyphens/apostrophes so MULTI-WORD countries match too
  // (the single-word `\p{L}+` missed "Vereinigtes Königreich").
  if (!hasPlz && lines.length >= 2 && /^[\p{L}][\p{L}\s.'-]*$/u.test(ort)) {
    ort = lines[lines.length - 2]!;
  }
  // "80539 München" → "München"; a line without a leading PLZ stays intact.
  return ort.replace(/^\d{4,5}\s+/, "").trim() || ort;
}
