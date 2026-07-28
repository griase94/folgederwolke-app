/**
 * Shared Auslage-status helpers (Aurora A-flow S0 extraction).
 *
 * `deriveStatus` + `maskIban` previously lived inline in the public status
 * route (`/auslage-status/[ausId]/+page.server.ts`). They are extracted here
 * so the member-portal status mirror (`/portal/auslagen[/…]`, S2) and the
 * batch/group status branch (S1) resolve the SAME canonical status from the
 * SAME code — one source of truth, no drift between the public and member
 * views of an identical submission.
 */

export type AuslageStatus =
  | "eingegangen"
  | "in_pruefung"
  | "geprueft"
  | "erstattet"
  | "abgelehnt";

/**
 * Map DB decision/state to a canonical public status label.
 *
 * Timeline:
 *   eingegangen   — submitted, admin has not opened it yet
 *   in_pruefung   — admin has opened it in the audit inbox (reviewed_at set)
 *   geprueft      — admin decided (approved); waiting for transfer
 *   erstattet     — approved AND the linked expense has erstattet_am set
 *   abgelehnt     — admin rejected the submission
 */
export function deriveStatus(row: {
  decision: string | null;
  decidedAt: Date | null;
  reviewedAt: Date | null;
  erstattetAm: string | null;
}): AuslageStatus {
  if (row.decidedAt) {
    if (row.decision === "rejected") return "abgelehnt";
    if (row.decision === "approved" && row.erstattetAm) return "erstattet";
    return "geprueft";
  }
  if (row.reviewedAt) return "in_pruefung";
  return "eingegangen";
}

/**
 * Mask an IBAN for display: keep only the last 4 characters, star the rest.
 * The full stored IBAN never leaves the server (privacy rule §2.2b) — callers
 * render only this masked form. Returns "****" for degenerate short inputs.
 */
export function maskIban(iban: string): string {
  if (iban.length <= 4) return "****";
  return `${"*".repeat(iban.length - 4)}${iban.slice(-4)}`;
}
