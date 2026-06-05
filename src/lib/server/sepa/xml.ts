/**
 * SEPA pain.001.001.03 Credit Transfer Initiation generator (Phase 5).
 *
 * Produces a standards-compliant pain.001.001.03 XML document for
 * approved-but-not-erstattet expenses.
 *
 * Spec:
 *  - <Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
 *  - One CstmrCdtTrfInitn with GrpHdr + one PmtInf grouping all txs
 *  - BatchBooking = true
 *  - BIC optional (post-2016 SEPA)
 *  - RmtInf/Ustrd: "Erstattung {businessId}: {bezeichnung}"
 *  - Initiator + debtor from a single readStammdaten() read (white-label)
 *
 * §5.5.1 "SEPA XML kopieren" spec.
 */

import type { ApprovedExpense } from "$lib/server/domain/transactions.js";
import { readStammdaten } from "$lib/server/domain/settings-stammdaten.js";

export interface SepaTransactionInput {
  id: string;
  businessId: string;
  bezeichnung: string;
  betragCents: number;
  /** IBAN of the recipient — built by caller from externIban or memberIban */
  recipientIban: string;
  /** Display name for recipient */
  recipientName: string;
}

/**
 * Debtor (sending-side) account info. When omitted (or both fields blank)
 * the generator falls back to <Id>NOTPROVIDED</Id> placeholders — a
 * historical compatibility mode kept for tests/imports without DB access.
 *
 * In production, callers use {@link generateSepaXmlFromSettings}, which reads
 * `readStammdaten()` once and supplies both the debtor account and the
 * initiator name from that single source.
 */
export interface SepaDebtor {
  iban?: string | null;
  bic?: string | null;
}

export interface SepaXmlOptions {
  /**
   * Initiating party / debtor display name (the Verein). White-label: this is
   * sourced from `readStammdaten().name` via {@link generateSepaXmlFromSettings}
   * — never a hardcoded FdW literal. When omitted, an empty <Nm> is emitted
   * (used only by pure unit tests that don't assert on the initiator).
   */
  initiatorName?: string;
  /** Debtor (Verein) account info. See {@link SepaDebtor}. */
  debtor?: SepaDebtor;
  /**
   * Override for the document creation timestamp. Tests pin this to make
   * msgId / CreDtTm deterministic. Defaults to `new Date()`.
   */
  now?: Date;
}

export interface SepaXmlResult {
  xml: string;
  /** Number of transactions included */
  txCount: number;
  /** Total in cents */
  totalCents: number;
  /** ISO timestamp embedded in the document (with Berlin tz offset). */
  createdAt: string;
  /** Message ID embedded in the document */
  msgId: string;
}

/**
 * Build SepaTransactionInput[] from ApprovedExpense[] — filters to rows that
 * have a known IBAN (extern or member). Rows without an IBAN are skipped.
 */
export function buildSepaInputs(
  expenses: ApprovedExpense[],
): SepaTransactionInput[] {
  const result: SepaTransactionInput[] = [];
  for (const e of expenses) {
    const iban = e.bezahltVonKind === "extern" ? e.externIban : e.memberIban;
    if (!iban) continue;
    const name =
      e.bezahltVonKind === "extern"
        ? (e.externName ?? e.bezahltVonDisplay)
        : e.bezahltVonDisplay;
    result.push({
      id: e.id,
      businessId: e.businessId,
      bezeichnung: e.bezeichnung,
      betragCents: e.betragCents,
      recipientIban: iban.replace(/\s/g, ""),
      recipientName: sanitizeSepaText(name).slice(0, 70),
    });
  }
  return result;
}

/**
 * Generate pain.001.001.03 XML for the given list of transactions.
 *
 * @throws if transactions is empty
 */
export function generateSepaXml(
  transactions: SepaTransactionInput[],
  options: SepaXmlOptions = {},
): SepaXmlResult {
  if (transactions.length === 0) {
    throw new Error("Keine Transaktionen für SEPA-XML vorhanden");
  }

  const initiatorName = sanitizeSepaText(options.initiatorName ?? "").slice(
    0,
    70,
  );

  const now = options.now ?? new Date();
  // XSD-strict validators (notably KBC, ING, Sparkassen profiles) reject
  // a CreDtTm without timezone — emit Berlin local time + offset.
  const createdAt = formatBerlinIso(now);
  const dateOnly = createdAt.slice(0, 10);

  const msgId = `FDW-${dateOnly.replace(/-/g, "")}-${now.getTime().toString(36).toUpperCase()}`;
  const pmtInfId = `${msgId}-PMT`;

  const totalCents = transactions.reduce((s, t) => s + t.betragCents, 0);
  const totalEur = centsToEurStr(totalCents);
  const txCount = transactions.length;

  const cdtTrfTxInf = transactions
    .map((t, idx) => {
      const endToEndId = `${msgId}-${String(idx + 1).padStart(3, "0")}`;
      const amtEur = centsToEurStr(t.betragCents);
      const remittance = sanitizeSepaText(
        `Erstattung ${t.businessId}: ${t.bezeichnung}`,
      ).slice(0, 140);

      return `      <CdtTrfTxInf>
        <PmtId>
          <EndToEndId>${escapeXml(endToEndId)}</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="EUR">${amtEur}</InstdAmt>
        </Amt>
        <Cdtr>
          <Nm>${escapeXml(t.recipientName)}</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <IBAN>${escapeXml(t.recipientIban)}</IBAN>
          </Id>
        </CdtrAcct>
        <RmtInf>
          <Ustrd>${escapeXml(remittance)}</Ustrd>
        </RmtInf>
      </CdtTrfTxInf>`;
    })
    .join("\n");

  // Debtor account (Verein) — prefer real IBAN/BIC from settings; fall
  // back to NOTPROVIDED placeholders only when BOTH are unset (kept for
  // tests and historical compatibility — most banks reject this).
  const dbtrIban = options.debtor?.iban?.replace(/\s/g, "").trim() ?? "";
  const dbtrBic = options.debtor?.bic?.replace(/\s/g, "").trim() ?? "";
  const dbtrAcctXml = dbtrIban
    ? `      <DbtrAcct>
        <Id>
          <IBAN>${escapeXml(dbtrIban)}</IBAN>
        </Id>
      </DbtrAcct>`
    : `      <DbtrAcct>
        <Id>
          <Othr>
            <Id>NOTPROVIDED</Id>
          </Othr>
        </Id>
      </DbtrAcct>`;
  const dbtrAgtXml = dbtrBic
    ? `      <DbtrAgt>
        <FinInstnId>
          <BIC>${escapeXml(dbtrBic)}</BIC>
        </FinInstnId>
      </DbtrAgt>`
    : `      <DbtrAgt>
        <FinInstnId>
          <Othr>
            <Id>NOTPROVIDED</Id>
          </Othr>
        </FinInstnId>
      </DbtrAgt>`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03 pain.001.001.03.xsd">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${escapeXml(msgId)}</MsgId>
      <CreDtTm>${createdAt}</CreDtTm>
      <NbOfTxs>${txCount}</NbOfTxs>
      <CtrlSum>${totalEur}</CtrlSum>
      <InitgPty>
        <Nm>${escapeXml(initiatorName)}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${escapeXml(pmtInfId)}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${txCount}</NbOfTxs>
      <CtrlSum>${totalEur}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt>${dateOnly}</ReqdExctnDt>
      <Dbtr>
        <Nm>${escapeXml(initiatorName)}</Nm>
      </Dbtr>
${dbtrAcctXml}
${dbtrAgtXml}
      <ChrgBr>SLEV</ChrgBr>
${cdtTrfTxInf}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;

  return { xml, txCount, totalCents, createdAt, msgId };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * White-label: generate the SEPA document with a SINGLE source of Verein
 * provenance. Reads `readStammdaten()` once and feeds the initiator/debtor
 * name (`sd.name`) AND the debtor account (`sd.iban` / `sd.bic`) from that one
 * read — so the InitgPty/Dbtr name can never diverge from the DbtrAcct it
 * belongs to. Replaces the former split path (env+FdW fallback for the name,
 * a separate settings reader for the account).
 */
export async function generateSepaXmlFromSettings(
  transactions: SepaTransactionInput[],
  options: Omit<SepaXmlOptions, "initiatorName" | "debtor"> = {},
): Promise<SepaXmlResult> {
  const sd = await readStammdaten();
  return generateSepaXml(transactions, {
    ...options,
    initiatorName: sd.name,
    debtor: { iban: sd.iban, bic: sd.bic },
  });
}

/**
 * Format a Date as `YYYY-MM-DDTHH:MM:SS+HH:MM` in Europe/Berlin local time.
 * Required for XSD-strict pain.001 validators.
 */
function formatBerlinIso(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "shortOffset",
  }).formatToParts(d);
  const lookup: Record<string, string> = {};
  for (const p of parts) lookup[p.type] = p.value;
  const offsetRaw = lookup.timeZoneName ?? "GMT+01:00";
  const m = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(offsetRaw);
  let offset = "+00:00";
  if (m && m[1] && m[2]) {
    const sign = m[1];
    const hh = m[2].padStart(2, "0");
    const mm = (m[3] ?? "00").padStart(2, "0");
    offset = `${sign}${hh}:${mm}`;
  }
  return `${lookup.year}-${lookup.month}-${lookup.day}T${lookup.hour}:${lookup.minute}:${lookup.second}${offset}`;
}

/** Converts cents to "1234.56" EUR string (SEPA requires 2 decimal places). */
function centsToEurStr(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Escapes XML special characters. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Replaces non-SEPA characters with safe equivalents.
 * SEPA character set: a-z A-Z 0-9 and /-.?:(),'+
 * Also strips leading/trailing whitespace.
 */
function sanitizeSepaText(s: string): string {
  return s
    .replace(/[äÄ]/g, "ae")
    .replace(/[öÖ]/g, "oe")
    .replace(/[üÜ]/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-zA-Z0-9 /\-.?:(),'+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
