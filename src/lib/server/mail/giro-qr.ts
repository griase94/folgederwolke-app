/**
 * EPC 069 — SEPA "Quick Response" / GiroCode payload builder.
 *
 * The European Payments Council's QR-payment standard. Every major German
 * banking app reads it: scan → "SEPA-Überweisung" form pre-filled with
 * IBAN, BIC, recipient, amount, Verwendungszweck → user confirms.
 *
 * This module produces only the *text payload*. PNG rendering requires a
 * QR-encoding library (none are in this project's deps yet — see
 * `docs/reviews/2026-05-19-deepdive-pwa-mobile.md` PM-024). Until a lib
 * is approved, the mail templates ship the payload as a `<pre>` block —
 * power users can still copy/scan it, and reviewers can audit the wire
 * format without running the app.
 *
 * Payload structure (each field on its own line, LF only):
 *
 *   BCD                        Service tag (constant)
 *   001                        Version (constant)
 *   1                          Character set (1 = UTF-8)
 *   SCT                        Identification (SEPA Credit Transfer)
 *   <BIC>                      Optional — may be empty (line still present)
 *   <Recipient name>           Max 70 chars
 *   <IBAN>                     No spaces
 *   EUR<amount>                Dot-decimal, two places, no thousands sep
 *   <Purpose code>             Optional (rare in DE) — empty in our payloads
 *   <Structured remittance>    Optional — empty in our payloads
 *   <Unstructured remittance>  Verwendungszweck — max 140 chars
 *
 * Spec: https://www.europeanpaymentscouncil.eu/document-library/guidance-documents/quick-response-code-guidelines-enable-data-capture-initiation
 */

export interface Epc069Input {
  /** BIC — optional. If undefined or empty, the field is emitted as an empty line. */
  bic?: string;
  /** Recipient name (max 70 chars per spec — not enforced here, caller's job). */
  name: string;
  /** IBAN — whitespace is stripped automatically. */
  iban: string;
  /** Amount in cents (ADR-0003 — never floats for money). */
  amountCents: number;
  /** Verwendungszweck — unstructured remittance, max 140 chars (not enforced here). */
  remittance: string;
}

/**
 * Build the EPC 069 text payload for a SEPA credit transfer.
 *
 * Pure function — no I/O, no side effects. Encoding the result as a QR
 * image is a separate concern (deferred until a QR lib is approved).
 */
export function buildEpc069Payload(input: Epc069Input): string {
  const { bic, name, iban, amountCents, remittance } = input;

  if (!Number.isInteger(amountCents)) {
    throw new Error(
      `buildEpc069Payload: amountCents must be an integer, got ${amountCents}`,
    );
  }
  if (amountCents < 0) {
    throw new Error(
      `buildEpc069Payload: amountCents must be non-negative, got ${amountCents}`,
    );
  }

  const ibanCompact = iban.replace(/\s+/g, "");
  const amountStr = formatEuro(amountCents);

  const lines = [
    "BCD",
    "001",
    "1",
    "SCT",
    bic ?? "",
    name,
    ibanCompact,
    `EUR${amountStr}`,
    "", // Purpose code — unused
    "", // Structured remittance — unused
    remittance,
  ];

  return lines.join("\n");
}

/**
 * Format an integer-cents amount as EPC 069 expects: dot decimal, two places,
 * no thousands separator. e.g. 5000 → "50.00", 119000 → "1190.00".
 */
function formatEuro(cents: number): string {
  const euros = Math.trunc(cents / 100);
  const remainder = cents % 100;
  return `${euros}.${remainder.toString().padStart(2, "0")}`;
}
