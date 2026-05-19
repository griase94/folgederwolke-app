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
 *  - Initiator from VEREIN_NAME env (ADR: env.ts)
 *
 * §5.5.1 "SEPA XML kopieren" spec.
 */

import { env } from "$lib/server/env.js";
import type { ApprovedExpense } from "$lib/server/domain/transactions.js";

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

export interface SepaXmlResult {
  xml: string;
  /** Number of transactions included */
  txCount: number;
  /** Total in cents */
  totalCents: number;
  /** ISO timestamp embedded in the document */
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
): SepaXmlResult {
  if (transactions.length === 0) {
    throw new Error("Keine Transaktionen für SEPA-XML vorhanden");
  }

  const initiatorName = sanitizeSepaText(
    env.VEREIN_NAME || "Folge der Wolke e.V.",
  ).slice(0, 70);

  const now = new Date();
  const createdAt = now.toISOString().slice(0, 19); // YYYY-MM-DDTHH:MM:SS (no Z, local implied)
  const dateOnly = now.toISOString().slice(0, 10);

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
      <DbtrAcct>
        <Id>
          <Othr>
            <Id>NOTPROVIDED</Id>
          </Othr>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <Othr>
            <Id>NOTPROVIDED</Id>
          </Othr>
        </FinInstnId>
      </DbtrAgt>
${cdtTrfTxInf}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;

  return { xml, txCount, totalCents, createdAt, msgId };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
