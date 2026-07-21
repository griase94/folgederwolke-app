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
  strasse: string | null;
  plz: string | null;
  ort: string | null;
};

/**
 * Assemble the structured address into the multi-line "Briefblock" as it
 * appears on the invoice — `Straße Hausnr` on line 1, `PLZ Ort` on line 2:
 *
 *   Musterstraße 1
 *   80331 München
 *
 * The country line is deliberately NOT included here: the Rechnung v2 renderer
 * adds it separately (below PLZ Ort) only for non-DE customers. The result is
 * split back into lines by `addressLines()` (server) — same format the old
 * free-text `address_block` produced, so the PDF/mail output is unchanged.
 * Pure + client-safe: the same helper drives the live modal preview.
 */
export function buildCustomerBriefblock(addr: StructuredAddress): string {
  const strasse = (addr.strasse ?? "").trim();
  const plzOrt = [addr.plz, addr.ort]
    .map((s) => (s ?? "").trim())
    .filter((s) => s.length > 0)
    .join(" ");
  return [strasse, plzOrt].filter((l) => l.length > 0).join("\n");
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
  if (!hasPlz && lines.length >= 2 && /^\p{L}+$/u.test(ort)) {
    ort = lines[lines.length - 2]!;
  }
  // "80539 München" → "München"; a line without a leading PLZ stays intact.
  return ort.replace(/^\d{4,5}\s+/, "").trim() || ort;
}
