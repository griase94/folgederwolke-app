/**
 * Parse a human-entered Euro amount (German or English locale) and return
 * the value in integer cents.
 *
 * Heuristic:
 * - Both `,` and `.` present: the LAST one is the decimal separator.
 *   e.g. "1.000,50" → German (comma last) → 100050
 *        "1,000.50" → English (dot last)  → 100050
 * - Only `,` present: comma is the decimal separator.
 *   e.g. "12,50" → 1250
 * - Only `.` present:
 *   If the string matches /^\d{1,3}(\.\d{3})+$/ (dot followed by exactly
 *   3 digits, possibly repeated), the dot is a German thousands separator.
 *   e.g. "1.000" → 100000, "1.000.000" → 100000000
 *   Otherwise the dot is the decimal separator.
 *   e.g. "12.50" → 1250
 * - No separator: plain integer.
 *   e.g. "1000" → 100000
 *
 * Returns NaN for empty / non-numeric input.
 */
export function parseBetragCents(raw: string): number {
  if (!raw) return NaN;
  let cleaned = raw.replace(/[^\d,.]/g, "");
  if (!cleaned) return NaN;

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  if (hasComma && hasDot) {
    // Mixed: the last separator is the decimal separator
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    if (lastComma > lastDot) {
      // German format: 1.000,50
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      // English format: 1,000.50
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Only comma → German decimal separator
    cleaned = cleaned.replace(",", ".");
  } else if (hasDot) {
    // Only dot: check if all dots are thousands separators (German style)
    if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
      cleaned = cleaned.replace(/\./g, "");
    }
    // else: dot is a decimal separator (English style) — already JS-friendly
  }
  // else: plain digits, leave as-is

  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? Math.round(num * 100) : NaN;
}
