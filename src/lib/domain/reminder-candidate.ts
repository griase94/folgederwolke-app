/**
 * Client-safe reminder-candidate types.
 *
 * Mirror of the shapes produced by the server loader
 * (`$lib/server/domain/reminder-candidates.ts`), lifted here so Svelte
 * components (ReminderRecipientRow, the Bulk sheet) can `import type` them
 * without dragging the server module — and SvelteKit's `$lib/server` guard —
 * into the client bundle. Same pattern as `beitrag-cell.ts`.
 */

export type ReminderBlockedReason = "no_email" | "recently_reminded";

export type ReminderCandidate = {
  memberId: string;
  /** "Vorname Nachname". */
  name: string;
  email: string | null;
  /** Only owing states reach the list. */
  state: "open" | "partial" | "overdue";
  /** Soll − bezahlt (clamped ≥ 0). The row + summary show this ("offen"). */
  openCents: number;
  /**
   * The full year Beitrag (Soll). The reminder MAIL dunning shows this as
   * {Betrag} (checkReminderAllowed → resolved.betragCents), so the sheet preview
   * uses it too — keeping preview {Betrag} == the sent mail's {Betrag} even for
   * partial payers (openCents < betragCents).
   */
  betragCents: number;
  /** ISO timestamp of the last beitrag_reminder, or null. */
  lastReminderAt: string | null;
  /** True when the member can be reminded (has e-mail, not recently reminded). */
  selectable: boolean;
  blockedReason: ReminderBlockedReason | null;
};

export type ReminderCandidatesData = {
  year: number;
  candidates: ReminderCandidate[];
};
