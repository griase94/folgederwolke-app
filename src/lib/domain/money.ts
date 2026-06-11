/**
 * Money math + display helpers (ADR-0003).
 *
 * All storage in cents (`bigint`). All math in cents. Display formatting
 * rounds half-away-from-zero (German "kaufmännische Rundung", which differs
 * from banker's rounding for the .5 case).
 *
 * Generated DB column `betrag_eur = betrag_cents::numeric / 100` is for
 * read-side analytics (EÜR exports, dashboard sums). NEVER reverse-engineer
 * cents from euro — always start from cents.
 */

/** Parse a user-entered euro string ("12,34" or "12.34" or "1.234,56") into cents. */
export function parseEuroToCents(input: string): bigint {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("parseEuroToCents: empty input");
  // Strip the sign FIRST so the separator heuristics below operate on the bare
  // digit/separator string (matters for the dot-only thousands-grouping regex,
  // which must not see a leading "-").
  const negative = trimmed.startsWith("-");
  let normalized = negative ? trimmed.slice(1) : trimmed;
  // Disambiguate the separators (de-DE primary, English fallback). This MUST
  // stay byte-for-byte equivalent to the client parser `parseBetragCents` in
  // `$lib/client/parse-betrag.ts` so the same input never parses 10.000× apart
  // (one parser, one set of de-DE rules — see money.test.ts cross-checks):
  //   - both `.` and `,` present → the LAST separator is the decimal one
  //     ("1.234,56" → German → 1234.56; "1,234.56" → English → 1234.56).
  //   - only `,` present → `,` is the decimal ("12,50" → 12.50).
  //   - only `.` present → the dots are thousands separators ONLY when the
  //     whole string matches /^\d{1,3}(\.\d{3})+$/ (1–3 digits then one or more
  //     ".ddd" groups, e.g. "1.234" → 1234, "1.234.567" → 1234567). Otherwise
  //     the dot is a decimal point ("12.5" → 12.5, "1234.56" → 1234.56, and a
  //     malformed "1.2345"/"1.234.56" falls through to the digit-shape guard
  //     below and throws).
  if (normalized.includes(",") && normalized.includes(".")) {
    const lastComma = normalized.lastIndexOf(",");
    const lastDot = normalized.lastIndexOf(".");
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  } else if (normalized.includes(".")) {
    if (/^\d{1,3}(\.\d{3})+$/.test(normalized)) {
      normalized = normalized.replace(/\./g, "");
    }
    // else: dot is a decimal separator (English style) — already JS-friendly.
  }
  const parts = normalized.split(".");
  if (parts.length > 2) {
    throw new Error(`parseEuroToCents: invalid number ${input}`);
  }
  const wholeStr = parts[0] ?? "0";
  const fracStr = (parts[1] ?? "").padEnd(2, "0").slice(0, 2);
  if (!/^\d+$/.test(wholeStr) || !/^\d{0,2}$/.test(fracStr)) {
    throw new Error(`parseEuroToCents: invalid number ${input}`);
  }
  const cents = BigInt(wholeStr) * 100n + BigInt(fracStr || "0");
  return negative ? -cents : cents;
}

/** Format cents → "12,34 €" (German locale, half-away-from-zero — `Intl` already does this). */
export function formatCentsAsEuro(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = abs / 100n;
  const frac = abs % 100n;
  const wholeStr = new Intl.NumberFormat("de-DE").format(whole);
  const fracStr = frac.toString().padStart(2, "0");
  return `${negative ? "-" : ""}${wholeStr},${fracStr} €`;
}

/** Sum cents safely (bigint arithmetic). */
export function sumCents(values: bigint[]): bigint {
  return values.reduce((acc, v) => acc + v, 0n);
}
