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
  // Disambiguate the separators (de-DE primary, English fallback):
  //   - both `.` and `,` present → `.` is a thousands sep, `,` is the decimal
  //     ("1.234,56" → 1234.56).
  //   - only `,` present → `,` is the decimal ("12,50" → 12.50).
  //   - only `.` present → ambiguous. A single dot followed by exactly 1–2
  //     digits is the decimal point (English fallback "1234.56", "12,5"-typo
  //     "12.5"). Anything else — multiple dots, or a single dot with a 3-digit
  //     group like "1.234" — is German thousands grouping and the dots are
  //     stripped ("1.234" → 1234, "1.234.567" → 1234567).
  let normalized = trimmed;
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  } else if (normalized.includes(".")) {
    const dotCount = (normalized.match(/\./g) ?? []).length;
    const trailing = normalized.length - normalized.lastIndexOf(".") - 1;
    const dotIsDecimal = dotCount === 1 && (trailing === 1 || trailing === 2);
    if (!dotIsDecimal) normalized = normalized.replace(/\./g, "");
  }
  const negative = normalized.startsWith("-");
  if (negative) normalized = normalized.slice(1);
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
