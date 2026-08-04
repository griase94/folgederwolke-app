/**
 * Überweisungs-Werkstatt helpers (pure, client-safe).
 *
 * WHAT LEFT IN A-S3, and why — these were not merely unused, they were WRONG:
 *
 * - `claimIban` picked `extern_iban` or the LIVE `members.iban` by payer kind.
 *   It could not see `auslagen_submissions.erstattung_iban`, the snapshot taken
 *   when the member submitted, so a member who had changed banks would have
 *   been paid at the NEW account for an OLD claim. The payout target is now
 *   resolved server-side by the ratified M4 precedence
 *   (`server/domain/erstattung-payout.ts`) and arrives as `payoutIban`.
 *
 * - `claimZweck` built `"{Expense-Nr} {Bezeichnung}"` — a THIRD Verwendungszweck
 *   format next to the mail's and the bank form's, so the member could not match
 *   the transfer on their statement. One function owns it now
 *   (`server/domain/erstattung-verwendungszweck.ts`), read by the Werkstatt AND
 *   the mail (Abnahme #14).
 *
 * - `COPY_FIELD_ORDER` / `COPY_FIELD_LABELS` / `claimCopyValue` moved into
 *   `ErstattungClaimCard`, which owns the bank-form order as part of its
 *   anatomy instead of leaving each page to re-apply a list.
 *
 * Deleted rather than deprecated (pre-launch, dead-kit ban).
 */

/** Only the fields the remaining helpers read. */
export interface UeberweisungClaim {
  betragCents: number;
  bezahltVonKind: string;
  bezahltVonDisplay: string;
  externName: string | null;
}

/**
 * The bank's "Empfängername". Verification-of-Payee rejects a mismatch, so an
 * extern payer's own name wins over the display string.
 */
export function claimName(c: UeberweisungClaim): string {
  if (c.bezahltVonKind === "extern" && c.externName) return c.externName;
  return c.bezahltVonDisplay;
}

/**
 * The amount as a bank form wants it: bare comma-decimal, no currency symbol.
 * The one sanctioned exception to "format money via formatMoney".
 */
export function claimBetragText(
  c: Pick<UeberweisungClaim, "betragCents">,
): string {
  return (c.betragCents / 100).toFixed(2).replace(".", ",");
}
