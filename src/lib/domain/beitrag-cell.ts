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
  /** Payment note (member_beitrags.notes) — seeds the dialog so mark-paid / edit
   *  preserve it instead of clobbering it to null on the SET-semantics submit. */
  notes: string | null;
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
  /**
   * True when no Beitragssatz is configured for the year — the matrix header
   * shows a "Beitragssatz {year} fehlt" hint instead of implying a Soll
   * (spec §4.5). Distinct from isLocked.
   */
  satzMissing: boolean;
};

export type MatrixMember = {
  id: string;
  vorname: string;
  nachname: string;
  /** null when no address on file — gates the "Erinnerung senden" ghost. */
  email: string | null;
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

/**
 * Which popover a cell click opens (or null = non-interactive). `mini` is the
 * read-only dialog for "—" cells (pre_join / post_austritt) — the brief's
 * "kein Dead-End" rule (§1 var.7 / §6.4): every applicable cell leads somewhere.
 */
export type PopoverKind =
  | "mark-paid"
  | "paid"
  | "exempt"
  | "permanently_exempt"
  | "mini"
  | null;

/**
 * The ONE Beitrags-Chip state→tone mapping (S15 / DESIGN-DEBT-REGISTER).
 *
 * Single source of truth so the Matrix cell and the Liste/Detail/Karten pill can
 * never drift into two colour systems again — "überfällig" was amber in the
 * Matrix but rosa in the Liste before the BeitragCell consolidation. Follows the
 * `transaction-status.ts` label+tone pattern (domain module owns presentation
 * tone tokens).
 *
 * Aurora amber-discipline (flow-mitglieder red thread / §2 AC3): amber
 * (severity-warn) is reserved for `overdue`; a merely-open/partial Beitrag
 * carries the calm --neutral-open family and NEVER reads as a warning. `paid`
 * uses the app-wide emerald paid convention WITH a dark path so the chip is not
 * a static light-green stranded on a dark surface. Tokens only, no hardcoded hex.
 */
export function beitragCellTone(state: CellState): string {
  switch (state) {
    case "paid":
      return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-500/15 dark:text-emerald-300";
    case "overdue":
      return "border-severity-warn/30 bg-severity-warn/10 text-severity-warn-text";
    case "open":
    case "partial":
      return "border-neutral-open/40 bg-neutral-open/12 text-open-ink";
    case "exempt":
    case "permanently_exempt":
    case "locked_year":
      return "border-hairline bg-ink-300/10 text-ink-500";
    default:
      // not_applicable_* → muted dash, no chrome
      return "text-ink-300";
  }
}

/**
 * Short one-word label per state — the primary signal (text over glyph, WCAG
 * 1.4.1). `partial` renders a fraction at the callsite, so its label here is
 * only used for the compact sr-only case.
 */
export function beitragCellLabel(state: CellState): string {
  switch (state) {
    case "paid":
      return "Bezahlt";
    case "partial":
      return "Teilzahlung";
    case "open":
    case "overdue":
      return "Offen";
    case "exempt":
    case "permanently_exempt":
      return "Befreit";
    default:
      return "—";
  }
}

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
    case "not_applicable_pre_join":
    case "not_applicable_post_austritt":
      // "—" cells open the read-only mini (no dead-end). The plain-text reason
      // is supplied by the caller from member eintritts-/austritts-year.
      return "mini";
    default:
      // locked_year → non-interactive (the lock uses the separate onLocked path).
      return null;
  }
}

/**
 * The seven surfaces of `BeitragCellDialog` (modal-member-popovers §1). Four are
 * entry variants reached directly from a cell click (via `variantForKind`); the
 * other three are internal transitions (`edit` from paid-review "Bearbeiten",
 * `befreien` from mark-paid "Befreien") plus the read-only `readonly-mini` shown
 * for "—" cells (pre_join / post_austritt / satz-fehlt).
 */
export type BeitragDialogVariant =
  | "mark-paid"
  | "edit"
  | "befreien"
  | "paid-review"
  | "exempt-review"
  | "perm-exempt"
  | "readonly-mini";

/**
 * Map the popover `kind` emitted by BeitragCell.onOpenPopover to the dialog's
 * entry variant. Single source of truth so the matrix (and every other surface)
 * never re-derives the variant from cell state — it forwards `kind` and asks
 * here.
 */
export function variantForKind(
  kind: Exclude<PopoverKind, null>,
): BeitragDialogVariant {
  switch (kind) {
    case "mark-paid":
      return "mark-paid";
    case "paid":
      return "paid-review";
    case "exempt":
      return "exempt-review";
    case "permanently_exempt":
      return "perm-exempt";
    case "mini":
      return "readonly-mini";
  }
}
