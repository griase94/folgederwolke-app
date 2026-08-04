/**
 * IBAN validation — MOD-97 checksum + SEPA country whitelist.
 *
 * Validates an IBAN string per ISO 13616:
 *   1. Strip ASCII whitespace + typed dashes, uppercase.
 *   2. Country code in the SEPA list (B7 hardening — public form rejects
 *      non-SEPA refund accounts).
 *   3. Length matches the country-specific BBAN length.
 *   4. Move the first 4 chars (CCKK) to the end.
 *   5. Expand letters A=10..Z=35 to digits.
 *   6. The resulting big integer mod 97 must equal 1.
 *
 * Used by the public form to validate `bezahlt_von.extern.iban`.
 *
 * Environment-agnostic on purpose (A-S2b): the member portal validates the
 * IBAN live while typing, so the checksum cannot sit behind `$lib/server`.
 * `$lib/server/domain/iban.ts` re-exports this module for the server callers;
 * `$lib/client/iban.ts` adds the DOM-facing input handler on top.
 */

/**
 * Country → expected total IBAN length (ISO 13616, SEPA-eligible countries
 * + EEA/UK/CH/MC/SM/AD/VA which are part of the SEPA scheme).
 *
 * Source: https://www.swift.com/standards/data-standards/iban-international-bank-account-number
 */
export const SEPA_IBAN_LENGTHS: Readonly<Record<string, number>> =
  Object.freeze({
    AD: 24, // Andorra
    AT: 20, // Austria
    BE: 16, // Belgium
    BG: 22, // Bulgaria
    CH: 21, // Switzerland
    CY: 28, // Cyprus
    CZ: 24, // Czech Republic
    DE: 22, // Germany
    DK: 18, // Denmark
    EE: 20, // Estonia
    ES: 24, // Spain
    FI: 18, // Finland
    FO: 18, // Faroe Islands
    FR: 27, // France
    GB: 22, // United Kingdom
    GI: 23, // Gibraltar
    GL: 18, // Greenland
    GR: 27, // Greece
    HR: 21, // Croatia
    HU: 28, // Hungary
    IE: 22, // Ireland
    IS: 26, // Iceland
    IT: 27, // Italy
    LI: 21, // Liechtenstein
    LT: 20, // Lithuania
    LU: 20, // Luxembourg
    LV: 21, // Latvia
    MC: 27, // Monaco
    MT: 31, // Malta
    NL: 18, // Netherlands
    NO: 15, // Norway
    PL: 28, // Poland
    PT: 25, // Portugal
    RO: 24, // Romania
    SE: 24, // Sweden
    SI: 19, // Slovenia
    SK: 24, // Slovakia
    SM: 27, // San Marino
    VA: 22, // Vatican City
  });

/**
 * Strips ASCII whitespace + dashes and uppercases an IBAN candidate string.
 * Returns the normalized form (does NOT validate).
 *
 * Dashes are stripped because people type them as visual separators. Client
 * and server share this one implementation — they used to disagree on dashes,
 * so a dash-typed IBAN passed the form and failed the server.
 */
export function normalizeIban(iban: string): string {
  return iban.replace(/[\s-]+/g, "").toUpperCase();
}

/**
 * Group an IBAN into blocks of four for display / live input formatting:
 * "DE89370400440532013000" → "DE89 3704 0044 0532 0130 00".
 */
export function formatIban(raw: string): string {
  const clean = normalizeIban(raw);
  return clean.match(/.{1,4}/g)?.join(" ") ?? clean;
}

/**
 * The display mask for a STORED IBAN: "DE89 •••• 3000" — country + check
 * digits and the last four stay readable, the middle is hidden. Never elide
 * the tail: the last four are how a person recognises their own account
 * (portal-onboarding-iban §1a).
 *
 * The full stored IBAN never leaves the server; surfaces render only this.
 */
export function maskIbanDisplay(
  iban: string | null | undefined,
): string | null {
  if (!iban) return null;
  const clean = normalizeIban(iban);
  if (clean.length <= 8) return clean;
  return `${clean.slice(0, 4)} •••• ${clean.slice(-4)}`;
}

/**
 * MOD-97 checksum check on a normalized IBAN.
 * Internal — call `validateIban` for the full check (country + length + mod97).
 */
function mod97(iban: string): number {
  // Move first 4 chars (CCKK) to the end, then expand letters to digits.
  const rearranged = iban.slice(4) + iban.slice(0, 4);

  // Compute mod 97 incrementally to avoid BigInt for typical inputs.
  // Each letter A-Z maps to the two-digit value 10..35.
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    let chunk: string;
    if (code >= 48 && code <= 57) {
      // '0'..'9'
      chunk = ch;
    } else if (code >= 65 && code <= 90) {
      // 'A'..'Z'
      chunk = (code - 55).toString(); // A=10..Z=35
    } else {
      return -1; // invalid char — caller should already have rejected this
    }
    // Process chunk digit by digit through a 32-bit safe running modulus.
    for (const d of chunk) {
      remainder = (remainder * 10 + (d.charCodeAt(0) - 48)) % 97;
    }
  }
  return remainder;
}

/**
 * Validates an IBAN string for SEPA-eligible accounts.
 *
 * Returns true iff:
 *   - country code (first 2 chars) is in SEPA_IBAN_LENGTHS
 *   - total length matches the country's expected length
 *   - check digits (chars 3-4) are 2 ASCII digits
 *   - body is alphanumeric uppercase
 *   - MOD-97 of the rearranged + expanded form equals 1
 */
export function validateIban(iban: string): boolean {
  if (typeof iban !== "string") return false;
  const normalized = normalizeIban(iban);

  if (normalized.length < 15 || normalized.length > 34) return false;

  // Character set: A-Z, 0-9 only after normalization.
  if (!/^[A-Z0-9]+$/.test(normalized)) return false;

  // Country
  const country = normalized.slice(0, 2);
  const expectedLen = SEPA_IBAN_LENGTHS[country];
  if (!expectedLen) return false;
  if (normalized.length !== expectedLen) return false;

  // Check digits must be two ASCII digits
  if (!/^\d{2}$/.test(normalized.slice(2, 4))) return false;

  return mod97(normalized) === 1;
}
