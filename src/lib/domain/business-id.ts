/**
 * Business-ID format + year-consistency helpers (ADR-0010).
 *
 * Format: `<PREFIX>-<YYYY>-<NNN>` zero-padded, where:
 *   E = Einnahmen, A = Ausgaben, S = Spenden, FDW = Invoices,
 *   B = Bescheinigungs-Nr (donations.bescheinigung_nr per D10),
 *   AUS = Auslagen-Submission (public form).
 *
 * Importer (Phase 6) preserves legacy A-IDs verbatim; new rows go through
 * `id_counters(year, kind)` to produce the next NNN per (year, kind).
 *
 * The PG-side CHECK constraint enforces shape; this TS mirror is for
 * pre-write validation in form actions.
 */

export const BUSINESS_ID_PREFIXES = ["A", "E", "S", "FDW", "B", "AUS"] as const;
export type BusinessIdPrefix = (typeof BUSINESS_ID_PREFIXES)[number];

const BUSINESS_ID_RE = /^(A|E|S|FDW|B|AUS)-(\d{4})-(\d{3,})$/;

export function parseBusinessId(
  id: string,
): { prefix: BusinessIdPrefix; year: number; seq: number } | null {
  const m = BUSINESS_ID_RE.exec(id);
  if (!m) return null;
  return {
    prefix: m[1] as BusinessIdPrefix,
    year: parseInt(m[2]!, 10),
    seq: parseInt(m[3]!, 10),
  };
}

export function formatBusinessId(
  prefix: BusinessIdPrefix,
  year: number,
  seq: number,
): string {
  if (!Number.isInteger(year) || year < 2000 || year > 2099) {
    throw new Error(`formatBusinessId: invalid year ${year}`);
  }
  if (!Number.isInteger(seq) || seq < 1) {
    throw new Error(`formatBusinessId: invalid seq ${seq}`);
  }
  return `${prefix}-${year}-${seq.toString().padStart(3, "0")}`;
}

/** Returns null if the id parses + its year matches year_of_buchung; otherwise an error string. */
export function checkBusinessIdYearConsistency(
  id: string,
  yearOfBuchung: number,
): string | null {
  const parsed = parseBusinessId(id);
  if (!parsed) return `business_id ${id} does not match required format`;
  if (parsed.year !== yearOfBuchung) {
    return `business_id year ${parsed.year} mismatches year_of_buchung ${yearOfBuchung}`;
  }
  return null;
}
