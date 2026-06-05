/**
 * Shared CSV primitives for all export modules.
 *
 * Byte-parity with the jahresabschluss transactions.csv oracle route:
 *   - semicolon-delimited
 *   - UTF-8 with BOM (Excel DE-locale auto-detect)
 *   - quote/escape: wrap in `"…"` and double internal `"` when value contains
 *     any of `; " \r \n`
 *   - formula-injection neutralisation: prepend `'` when the stringified value
 *     starts with `= + - @ \t \r`
 */

/** UTF-8 BOM — prepend to every CSV so Excel DE-locale auto-detects UTF-8. */
export const BOM = "﻿";

/**
 * Escape a single CSV cell value.
 *
 * Rules (in order):
 * 1. null/undefined → empty string (no quoting, no injection guard).
 * 2. Stringify with String().
 * 3. Formula-injection guard: if the string starts with `= + - @ \t \r`,
 *    prepend a literal apostrophe `'`.
 * 4. Quote/escape: if the (possibly apostrophe-prefixed) string contains any
 *    of `;`, `"`, `\r`, `\n`, wrap in double-quotes and double internal `"`.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";

  let s = String(value);

  // Formula-injection neutralisation (OWASP CSV injection guard).
  // Characters that spreadsheet engines evaluate as formulas at position 0.
  if (/^[=+\-@\t\r]/.test(s)) {
    s = "'" + s;
  }

  // Quote/escape: match the oracle's rule exactly.
  if (/[;"\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;

  return s;
}

/**
 * Format an integer cent amount as a German-locale decimal string.
 *
 * Matches the oracle exactly: `(cents / 100).toFixed(2).replace('.', ',')`
 * → `1234,56` (no thousands separator).
 */
export function formatCents(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
