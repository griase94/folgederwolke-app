/**
 * Unit tests for SEPA pain.001.001.03 XML generator (@phase-5).
 */
import { describe, it, expect } from "vitest";
import {
  generateSepaXml,
  buildSepaInputs,
  type SepaTransactionInput,
} from "$lib/server/sepa/xml.js";
import type { ApprovedExpense } from "$lib/server/domain/transactions.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const tx1: SepaTransactionInput = {
  id: "uuid-1",
  businessId: "AUS-2026-001",
  bezeichnung: "Druckerpatronen",
  betragCents: 2350,
  recipientIban: "DE89370400440532013000",
  recipientName: "Max Mustermann",
};

const tx2: SepaTransactionInput = {
  id: "uuid-2",
  businessId: "AUS-2026-002",
  bezeichnung: "Raummiete März",
  betragCents: 15000,
  recipientIban: "DE75512108001245126199",
  recipientName: "Maria Schmidt",
};

// ---------------------------------------------------------------------------
// generateSepaXml
// ---------------------------------------------------------------------------

describe("generateSepaXml", () => {
  it("throws when transactions list is empty", () => {
    expect(() => generateSepaXml([])).toThrow();
  });

  it("produces valid XML declaration and Document namespace", () => {
    const { xml } = generateSepaXml([tx1]);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain(
      'xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"',
    );
  });

  it("has correct root element CstmrCdtTrfInitn", () => {
    const { xml } = generateSepaXml([tx1]);
    expect(xml).toContain("<CstmrCdtTrfInitn>");
    expect(xml).toContain("</CstmrCdtTrfInitn>");
  });

  it("includes GrpHdr with NbOfTxs and CtrlSum", () => {
    const { xml, txCount, totalCents } = generateSepaXml([tx1, tx2]);
    expect(xml).toContain(`<NbOfTxs>${txCount}</NbOfTxs>`);
    const expectedCtrlSum = (totalCents / 100).toFixed(2);
    expect(xml).toContain(`<CtrlSum>${expectedCtrlSum}</CtrlSum>`);
    expect(txCount).toBe(2);
    expect(totalCents).toBe(2350 + 15000);
  });

  it("sets BatchBooking to true", () => {
    const { xml } = generateSepaXml([tx1]);
    expect(xml).toContain("<BtchBookg>true</BtchBookg>");
  });

  it("includes PmtInf with SEPA SvcLvl code", () => {
    const { xml } = generateSepaXml([tx1]);
    expect(xml).toContain("<Cd>SEPA</Cd>");
  });

  it("includes correct IBAN in CdtrAcct", () => {
    const { xml } = generateSepaXml([tx1]);
    expect(xml).toContain("<IBAN>DE89370400440532013000</IBAN>");
  });

  it("uses correct RmtInf/Ustrd format", () => {
    const { xml } = generateSepaXml([tx1]);
    expect(xml).toContain("<Ustrd>");
    expect(xml).toContain("AUS-2026-001");
  });

  it("encodes XML special chars in Cdtr/Nm", () => {
    const txSpecial: SepaTransactionInput = {
      ...tx1,
      recipientName: "O'Brien & Partner",
    };
    const { xml } = generateSepaXml([txSpecial]);
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&apos;");
  });

  it("correctly calculates CtrlSum with two transactions", () => {
    const { totalCents } = generateSepaXml([tx1, tx2]);
    expect(totalCents).toBe(17350);
  });

  it("returns a stable msgId that is non-empty", () => {
    const { msgId } = generateSepaXml([tx1]);
    expect(msgId).toBeTruthy();
    expect(msgId.length).toBeGreaterThan(4);
  });

  it("includes individual transaction amounts as InstdAmt with EUR", () => {
    const { xml } = generateSepaXml([tx1]);
    expect(xml).toContain('Ccy="EUR"');
    expect(xml).toContain("23.50");
  });

  it("limits RmtInf/Ustrd to 140 chars", () => {
    const longBezeichnung = "A".repeat(200);
    const txLong: SepaTransactionInput = {
      ...tx1,
      bezeichnung: longBezeichnung,
    };
    const { xml } = generateSepaXml([txLong]);
    // Extract Ustrd content
    const match = xml.match(/<Ustrd>([^<]*)<\/Ustrd>/);
    expect(match).toBeTruthy();
    const ustrdContent = match?.[1] ?? "";
    expect(ustrdContent.length).toBeLessThanOrEqual(140);
  });
});

// ---------------------------------------------------------------------------
// buildSepaInputs
// ---------------------------------------------------------------------------

describe("buildSepaInputs", () => {
  const baseExpense: ApprovedExpense = {
    id: "exp-1",
    businessId: "AUS-2026-001",
    bezeichnung: "Test",
    betragCents: 1000,
    bezahltVonDisplay: "Max Mustermann",
    bezahltVonKind: "extern",
    externIban: "DE89370400440532013000",
    externName: "Max Mustermann",
    bezahltVonMemberId: null,
    memberIban: null,
  };

  it("maps extern expenses to SepaTransactionInput using externIban", () => {
    const inputs = buildSepaInputs([baseExpense]);
    expect(inputs).toHaveLength(1);
    const first = inputs[0];
    expect(first).toBeDefined();
    expect(first?.recipientIban).toBe("DE89370400440532013000");
    expect(first?.recipientName).toBe("Max Mustermann");
  });

  it("skips extern expenses without IBAN", () => {
    const noIban: ApprovedExpense = { ...baseExpense, externIban: null };
    expect(buildSepaInputs([noIban])).toHaveLength(0);
  });

  it("maps member expenses to SepaTransactionInput using memberIban", () => {
    const memberExpense: ApprovedExpense = {
      ...baseExpense,
      bezahltVonKind: "member",
      externIban: null,
      externName: null,
      bezahltVonMemberId: "member-uuid",
      memberIban: "DE75512108001245126199",
    };
    const inputs = buildSepaInputs([memberExpense]);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.recipientIban).toBe("DE75512108001245126199");
  });

  it("skips member expenses without memberIban", () => {
    const noIban: ApprovedExpense = {
      ...baseExpense,
      bezahltVonKind: "member",
      externIban: null,
      memberIban: null,
    };
    expect(buildSepaInputs([noIban])).toHaveLength(0);
  });

  it("strips whitespace from IBAN", () => {
    const spacedIban: ApprovedExpense = {
      ...baseExpense,
      externIban: "DE89 3704 0044 0532 0130 00",
    };
    const inputs = buildSepaInputs([spacedIban]);
    expect(inputs[0]?.recipientIban).toBe("DE89370400440532013000");
  });

  it("truncates recipientName to 70 chars", () => {
    const longName: ApprovedExpense = {
      ...baseExpense,
      externName: "A".repeat(100),
    };
    const inputs = buildSepaInputs([longName]);
    expect(inputs[0]?.recipientName.length).toBeLessThanOrEqual(70);
  });

  it("returns empty array for empty input", () => {
    expect(buildSepaInputs([])).toHaveLength(0);
  });
});
