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
  // German format: "1.234,56" → strip dots, replace comma with dot.
  // English fallback: "1234.56" stays.
  // Heuristic: if both `.` and `,` present, treat `.` as thousands sep.
  let normalized = trimmed;
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
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
