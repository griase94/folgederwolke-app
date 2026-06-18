/**
 * Canonical per-member-per-year Beitrags-Status resolver.
 *
 * Client-safe — no server imports. Used by every surface (list, detail, matrix,
 * popover, reminder guard) to derive a single authoritative `CellState` for a
 * given (member, year) pair.
 *
 * DERIVATION PRECEDENCE (member-zahlung redesign plan §CANONICAL STATUS MODEL):
 *  1. year < eintrittsJahr          → not_applicable_pre_join
 *  2. austrittsJahr !== null
 *     && year > austrittsJahr       → not_applicable_post_austritt
 *  3. member.beitragExempt          → permanently_exempt
 *  4. row?.isExempt                 → exempt
 *  5. festBis !== null
 *     && year <= festBis            → isLocked=true, continue to derive
 *                                     underlying state (paid/partial/open/…)
 *  6. row && paidCents >= betragCents > 0 → paid
 *  7. row && 0 < paidCents < betragCents  → partial  (KEY NEW STATE)
 *  8. else                          → open  (or overdue past faelligkeit+grace)
 *
 * ADR-0001: Berlin year only — callers must pass `berlinYear()` / `currentBuchungsjahr()`;
 * this function never calls `new Date().getFullYear()`.
 *
 * Package A — member-zahlung redesign.
 */

import type { CellState } from "$lib/domain/beitrag-cell.js";

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export type BeitragRow = {
  betragCents: number;
  paidCents: number;
  isExempt: boolean;
  gezahltAm: string | null;
};

export type ResolveBeitragStateInput = {
  /** The Buchungsjahr being resolved. ADR-0001: pass berlinYear(), never getFullYear(). */
  year: number;
  /** First year the member was active (parsed from eintrittsDatum YYYY). */
  eintrittsJahr: number;
  /** Last year the member was active, or null when still active. */
  austrittsJahr: number | null;
  /** Member-level permanent exemption (beitrag_exempt column). */
  beitragExempt: boolean;
  /** DB row from member_beitrags for (memberId, year), or null when no row exists. */
  row: BeitragRow | null;
  /** Beitragssatz in cents for `year`, or null when the Satz is not configured. */
  satzCents: number | null;
  /** festgeschrieben_bis setting value (latest locked Buchungsjahr), or null. */
  festBis: number | null;
  /** ISO date (YYYY-MM-DD) — Fälligkeitsdatum for overdue detection. Defaults to `${year}-03-31`. */
  faelligkeit?: string;
  /** Grace period in days after faelligkeit before a cell flips to overdue. Default 60. */
  graceDays?: number;
};

export type ResolveBeitragStateResult = {
  state: CellState;
  betragCents: number;
  paidCents: number;
  /**
   * True when the year is covered by festgeschriebenBis (read-only / archive).
   * The `state` reflects the honest underlying status (paid/partial/open/exempt),
   * never a dead "locked_year" — use `isLocked` to render the lock decoration.
   */
  isLocked: boolean;
  /**
   * True when there is no row AND no Beitragssatz configured for the year.
   * Signal for the UI to show a "Beitragssatz {year} fehlt" hint.
   */
  satzMissing: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// resolveBeitragState
// ---------------------------------------------------------------------------

/**
 * Derive the canonical display state for one (member, year) cell.
 *
 * This is the SINGLE SOURCE OF TRUTH — all surfaces (list, detail, matrix,
 * popover open/edit guard, reminder false-debt guard) MUST call this function
 * rather than re-implementing their own derivation.
 */
export function resolveBeitragState(
  input: ResolveBeitragStateInput,
): ResolveBeitragStateResult {
  const {
    year,
    eintrittsJahr,
    austrittsJahr,
    beitragExempt,
    row,
    satzCents,
    festBis,
    faelligkeit,
    graceDays = 60,
  } = input;

  // ── 1. Pre-Eintritt ───────────────────────────────────────────────────────
  if (year < eintrittsJahr) {
    return {
      state: "not_applicable_pre_join",
      betragCents: 0,
      paidCents: 0,
      isLocked: false,
      satzMissing: false,
    };
  }

  // ── 2. Post-Austritt ──────────────────────────────────────────────────────
  if (austrittsJahr !== null && year > austrittsJahr) {
    return {
      state: "not_applicable_post_austritt",
      betragCents: 0,
      paidCents: 0,
      isLocked: false,
      satzMissing: false,
    };
  }

  // ── 3. Permanent member-level exemption ───────────────────────────────────
  if (beitragExempt) {
    return {
      state: "permanently_exempt",
      betragCents: row ? row.betragCents : 0,
      paidCents: row ? row.paidCents : 0,
      isLocked: festBis !== null && year <= festBis,
      satzMissing: false,
    };
  }

  // ── 4. Per-year exemption ─────────────────────────────────────────────────
  if (row?.isExempt) {
    return {
      state: "exempt",
      betragCents: row.betragCents,
      paidCents: row.paidCents,
      isLocked: festBis !== null && year <= festBis,
      satzMissing: false,
    };
  }

  // Determine isLocked (step 5) — does NOT short-circuit; we continue deriving
  // the underlying state and annotate the result.
  const isLocked = festBis !== null && year <= festBis;

  // Derive betragCents: row wins, then satz, then 0 (satzMissing)
  const satzMissing = row === null && satzCents === null;
  const betragCents = row ? row.betragCents : (satzCents ?? 0);
  const paidCents = row ? row.paidCents : 0;

  // ── 6. Paid ───────────────────────────────────────────────────────────────
  if (row && paidCents >= betragCents && betragCents > 0) {
    return { state: "paid", betragCents, paidCents, isLocked, satzMissing };
  }

  // ── 7. Partial ────────────────────────────────────────────────────────────
  if (row && paidCents > 0 && paidCents < betragCents) {
    return { state: "partial", betragCents, paidCents, isLocked, satzMissing };
  }

  // ── 8. Open / Overdue ─────────────────────────────────────────────────────
  // Overdue check (only for non-locked, non-exempt, non-paid years — but we
  // compute it regardless; callers use isLocked to suppress overdue UI).
  const faelligkeitStr = faelligkeit ?? `${year}-03-31`;
  const faelligkeitDate = new Date(`${faelligkeitStr}T00:00:00Z`);
  const overdueThreshold = new Date(faelligkeitDate);
  overdueThreshold.setUTCDate(overdueThreshold.getUTCDate() + graceDays);

  const now = new Date();
  if (now > overdueThreshold) {
    return { state: "overdue", betragCents, paidCents, isLocked, satzMissing };
  }

  return { state: "open", betragCents, paidCents, isLocked, satzMissing };
}

// ---------------------------------------------------------------------------
// projectForList — folds overdue→open, strips locked overlay
// ---------------------------------------------------------------------------

/**
 * Fold a full `CellState` into the simplified list-view projection:
 *   - overdue   → open   (list shows one "Offen" chip, no overdue detail)
 *   - all others → unchanged
 *
 * For locked years the caller reads `isLocked` to add a lock decoration;
 * the state itself is always the underlying value.
 */
export function projectForList(state: CellState): CellState {
  if (state === "overdue") return "open";
  return state;
}
