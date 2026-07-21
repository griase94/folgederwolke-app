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
 *   001                        Version (constant — see "BIC required" note)
 *   1                          Character set (1 = UTF-8)
 *   SCT                        Identification (SEPA Credit Transfer)
 *   <BIC>                      REQUIRED in v001 (this builder)
 *   <Recipient name>           Max 70 chars
 *   <IBAN>                     No spaces
 *   EUR<amount>                Dot-decimal, two places, no thousands sep
 *   <Purpose code>             Optional (rare in DE) — empty in our payloads
 *   <Structured remittance>    Optional — empty in our payloads
 *   <Unstructured remittance>  Verwendungszweck — max 140 chars
 *
 * BIC required (v001 vs v002):
 *   EPC 069 v002 added the "empty BIC allowed for EEA payments where IBAN
 *   implies BIC" relaxation. v001 still REQUIRES a non-empty BIC. We emit
 *   v001 ("001" on line 2), so we MUST refuse to build a payload without a
 *   non-empty BIC. Most DE banking apps parse v001-with-empty-BIC defensively
 *   in practice, but that's not a contract — out-of-spec payloads can be
 *   silently rejected by any compliant reader. See cycle-2 expert review F1.
 *
 * Spec: https://www.europeanpaymentscouncil.eu/document-library/guidance-documents/quick-response-code-guidelines-enable-data-capture-initiation
 */

import QRCode from "qrcode";

export interface Epc069Input {
  /** BIC — REQUIRED for EPC 069 v001. Non-empty (after trim). */
  bic: string;
  /** Recipient name (max 70 chars per spec — not enforced here, caller's job). */
  name: string;
  /** IBAN — whitespace is stripped automatically. */
  iban: string;
  /** Amount in cents (ADR-0003 — never floats for money). */
  amountCents: number;
  /** Verwendungszweck — unstructured remittance, max 140 chars (not enforced here). */
  remittance: string;
  /**
   * Payload version (line 2). Default "001" (BIC-required) preserves the
   * existing BeitragsReminder `<pre>` behaviour. The invoice Giro-QR *image*
   * renderer passes "002" — the EPC-recommended standard for new
   * implementations (UTF-8, BIC optional, forward-compatible with v001
   * readers). We always supply a non-empty BIC (gated), so a v002 payload is
   * maximally scannable either way.
   */
  version?: "001" | "002";
}

/**
 * Build the EPC 069 text payload for a SEPA credit transfer.
 *
 * Pure function — no I/O, no side effects. Encoding the result as a QR
 * image is a separate concern (deferred until a QR lib is approved).
 *
 * Throws if `bic` is missing / empty / whitespace-only — EPC 069 v001
 * requires a non-empty BIC.
 */
export function buildEpc069Payload(input: Epc069Input): string {
  const { bic, name, iban, amountCents, remittance, version = "001" } = input;

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

  // EPC 069 v001: BIC is a REQUIRED field. Refuse to emit out-of-spec.
  const bicTrimmed = typeof bic === "string" ? bic.trim() : "";
  if (!bicTrimmed) {
    throw new Error(
      "buildEpc069Payload: BIC is required (EPC 069 v001). " +
        "Callers must supply a non-empty BIC, or skip Giro-QR rendering entirely.",
    );
  }

  const ibanCompact = iban.replace(/\s+/g, "");
  const amountStr = formatEuro(amountCents);

  const lines = [
    "BCD",
    version,
    "1", // Character set 1 = UTF-8
    "SCT",
    bicTrimmed,
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

/**
 * Render the EPC-069 "Girocode" for a SEPA credit transfer as a PNG.
 *
 * Reliability is the acceptance criterion (Andy). Concretely:
 *   - error correction level **M (15 %)** — mandated by EPC069-12.
 *   - the payload is encoded as an explicit UTF-8 **byte** segment (charset
 *     line "1"), so umlauts in the Empfänger / Verwendungszweck survive
 *     byte-exact (proven by the decode-roundtrip test), rather than being
 *     silently down-coded to Latin-1 by the library's string path.
 *   - a >=4-module quiet zone (`margin`) as the QR spec requires for scanners.
 *   - brand ink #1a1126 on pure white (~18:1 — effectively black to a
 *     scanner; the decode-roundtrip test proves it reads), no gradients or
 *     other colour tricks that could break scanning.
 *   - version "002" (EPC-recommended for new implementations); BIC is always
 *     supplied (the caller gates on it), so the code is maximally readable.
 *
 * Returns raw PNG bytes for embedding as a CID mail attachment (never a
 * data-URI — many mail clients strip those).
 */
export async function renderEpc069QrPng(
  input: Epc069Input,
  opts: { scale?: number; margin?: number } = {},
): Promise<Uint8Array> {
  const payload = buildEpc069Payload({
    ...input,
    version: input.version ?? "002",
  });
  const png = await QRCode.toBuffer(
    [{ data: Buffer.from(payload, "utf8"), mode: "byte" }],
    {
      errorCorrectionLevel: "M",
      type: "png",
      margin: opts.margin ?? 4,
      scale: opts.scale ?? 6,
      color: { dark: "#1a1126ff", light: "#ffffffff" },
    },
  );
  return new Uint8Array(png);
}
