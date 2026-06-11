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

// NOTE: `checkBusinessIdYearConsistency()` was removed with migration 0034.
// It enforced business_id.year == year_of_buchung, a coupling the DB dropped
// (`*_business_id_year_ck`) when year_of_buchung moved to the cash-flow date.
// A 2026-issued AUS-2026 receipt can legitimately book into 2025 (prior-year
// abfluss), so the id-year ↔ booking-year invariant no longer holds.
