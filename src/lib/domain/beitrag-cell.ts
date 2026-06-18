/**
 * Client-safe Beitragsmatrix cell types.
 *
 * These mirror the shapes produced by the server-side matrix loader
 * (`$lib/server/domain/matrix-loader.ts`) but live in a client-safe module so
 * Svelte components (BeitragsBadge, MatrixCell, popovers, MemberMatrix) can
 * `import type` them without dragging the server module into the browser bundle.
 *
 * The server loader re-exports these and is the single source of truth for the
 * derivation logic; this file only declares the data contract.
 *
 * Task 2.0 / Task 2.1 (Phase 2 UI).
 */

export type CellState =
  | "paid"
  | "partial"
  | "open"
  | "overdue"
  | "exempt"
  | "permanently_exempt"
  | "not_applicable_pre_join"
  | "not_applicable_post_austritt"
  | "locked_year";

export type MatrixCell = {
  memberId: string;
  year: number;
  state: CellState;
  /**
   * True when the year is covered by festgeschriebenBis (archive / read-only).
   * The `state` always reflects the honest underlying status (paid/partial/open/…),
   * never a dead "locked_year". Use `isLocked` to render the lock decoration.
   */
  isLocked: boolean;
  /** Year's Beitragssatz in cents (0 if no row and no Satz for year). */
  betragCents: number;
  paidCents: number;
  gezahltAm: string | null;
  /** Populated only for exempt / permanently_exempt cells. */
  exemptReason: string | null;
  /** Populated only when state === "overdue". */
  daysOverdue: number | null;
};

export type YearHeader = {
  year: number;
  /** Paid cells (excl. exempt / not_applicable). */
  paidCount: number;
  /** Denominator: active, non-exempt cells. */
  totalDueCount: number;
  paidSumCents: number;
  exemptCount: number;
  isLocked: boolean;
};

export type MatrixMember = {
  id: string;
  vorname: string;
  nachname: string;
  eintrittsJahr: number;
  /** null when no Austrittsdatum set (still active). */
  austrittsJahr: number | null;
  beitragExempt: boolean;
  beitragExemptReason: string | null;
};

export type MatrixData = {
  members: MatrixMember[];
  years: number[];
  cells: MatrixCell[];
  headers: YearHeader[];
  festgeschriebenBis: number | null;
};

/** Which popover a cell click should open (or null = non-interactive). */
export type PopoverKind =
  | "mark-paid"
  | "paid"
  | "exempt"
  | "permanently_exempt"
  | null;

/** Map a CellState to the popover it opens on click. */
export function popoverKindForState(state: CellState): PopoverKind {
  switch (state) {
    case "open":
    case "overdue":
    case "partial":
      return "mark-paid";
    case "paid":
      return "paid";
    case "exempt":
      return "exempt";
    case "permanently_exempt":
      return "permanently_exempt";
    default:
      // not_applicable_*, locked_year → non-interactive
      return null;
  }
}
