/**
 * The ONE Verwendungszweck for a reimbursement (Aurora A-flow S3.0).
 *
 * The Werkstatt puts this string on the clipboard for the bank form, and the
 * `auslage_erstattet` mail tells the member the same string to look for on
 * their statement. Two formats would mean the member cannot match the transfer
 * to the mail — so there is exactly one function and both read it (Abnahme #14).
 *
 * Shape: `Erstattung {AUS-Nr} {Verein}` — the AUS-Nr first, because that is
 * what both sides quote, and the Verein name so the member recognises the
 * sender among other transfers.
 *
 * Bank reality: SEPA `RmtInf/Ustrd` is capped at 140 characters, and many bank
 * forms cut earlier. The Verein name is therefore the part that gets trimmed —
 * never the AUS-Nr, which is the only machine-matchable token in there.
 */

/** SEPA end-to-end remittance information limit. */
const SEPA_USTRD_MAX = 140;

export function erstattungsVerwendungszweck(
  ausNr: string | null,
  vereinName: string,
): string {
  // A directly-booked expense has no AUS-Nr; then the Verein name alone is the
  // most useful thing we can offer.
  const head = ausNr ? `Erstattung ${ausNr}` : "Erstattung";
  const verein = vereinName.trim();
  if (!verein) return head;

  const full = `${head} ${verein}`;
  if (full.length <= SEPA_USTRD_MAX) return full;

  // Trim the Verein name, never the AUS-Nr.
  const room = SEPA_USTRD_MAX - head.length - 1;
  return room > 0 ? `${head} ${verein.slice(0, room).trimEnd()}` : head;
}
