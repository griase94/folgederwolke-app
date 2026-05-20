// @vitest-environment node
/**
 * @phase-1 @overnight-c8
 *
 * Tests for the EPC 069 SEPA Giro-QR payload builder.
 *
 * EPC 069 ("SEPA Quick Response" / "GiroCode") is the European Payments
 * Council standard for QR-encoded credit-transfer instructions. Every
 * major German banking app reads it: scan → fields pre-filled → confirm.
 *
 * Payload format (version 001, character set 1 = UTF-8):
 *
 *   BCD                        — service tag
 *   001                        — version
 *   1                          — character set (1 = UTF-8)
 *   SCT                        — identification (SEPA Credit Transfer)
 *   {BIC}                      — optional, may be empty
 *   {Empfänger-Name}           — max 70 chars
 *   {IBAN}                     — no spaces
 *   EUR{amount}                — e.g. EUR50.00 (dot decimal, no separators)
 *   {Purpose code}             — optional (e.g. CHAR), often empty
 *   {Structured remittance}    — optional, max 35 chars
 *   {Unstructured remittance}  — optional, max 140 chars (Verwendungszweck)
 *
 * Each field on its own line, separated by LF (\n). The total payload
 * must not exceed 331 bytes (we don't enforce that here — too long is
 * a calling-code problem; the formatter is a pure pretty-printer).
 *
 * Reference: https://www.europeanpaymentscouncil.eu/document-library/guidance-documents/quick-response-code-guidelines-enable-data-capture-initiation
 */

import { describe, expect, it } from "vitest";
import { buildEpc069Payload } from "../../src/lib/server/mail/giro-qr.js";

describe("buildEpc069Payload", () => {
  it("formats a standard SEPA Credit Transfer payload", () => {
    const payload = buildEpc069Payload({
      bic: "SSKMDEMMXXX",
      name: "Folge der Wolke e.V.",
      iban: "DE43830654089999999999",
      amountCents: 5000,
      remittance: "Mitgliedsbeitrag 2026 Lea Mustermann",
    });

    expect(payload).toBe(
      [
        "BCD",
        "001",
        "1",
        "SCT",
        "SSKMDEMMXXX",
        "Folge der Wolke e.V.",
        "DE43830654089999999999",
        "EUR50.00",
        "",
        "",
        "Mitgliedsbeitrag 2026 Lea Mustermann",
      ].join("\n"),
    );
  });

  // EPC 069 v001 REQUIRES a non-empty BIC. Only v002+ allows empty BIC for
  // EEA payments where the IBAN implies the BIC. We ship v001 → must refuse
  // out-of-spec payloads at the builder. (Cycle-2 expert review F1.)
  it("REJECTS payload build when BIC is missing entirely", () => {
    // bic is required on the Epc069Input type now; this call deliberately
    // violates the contract to assert the runtime guard also fires.
    const inputWithoutBic = {
      name: "Folge der Wolke e.V.",
      iban: "DE43830654089999999999",
      amountCents: 12345,
      remittance: "Test",
    } as unknown as Parameters<typeof buildEpc069Payload>[0];

    expect(() => buildEpc069Payload(inputWithoutBic)).toThrow(/BIC/i);
  });

  it("REJECTS payload build when BIC is the empty string", () => {
    expect(() =>
      buildEpc069Payload({
        bic: "",
        name: "Folge der Wolke e.V.",
        iban: "DE43830654089999999999",
        amountCents: 12345,
        remittance: "Test",
      }),
    ).toThrow(/BIC/i);
  });

  it("REJECTS payload build when BIC is whitespace only", () => {
    expect(() =>
      buildEpc069Payload({
        bic: "   ",
        name: "Folge der Wolke e.V.",
        iban: "DE43830654089999999999",
        amountCents: 12345,
        remittance: "Test",
      }),
    ).toThrow(/BIC/i);
  });

  it("strips whitespace from the IBAN", () => {
    const payload = buildEpc069Payload({
      bic: "HELADEF1WEM",
      name: "Folge der Wolke e.V.",
      iban: "DE43 8306 5408 9999 9999 99",
      amountCents: 100,
      remittance: "x",
    });

    expect(payload.split("\n")[6]).toBe("DE43830654089999999999");
  });

  it("trims whitespace around the BIC", () => {
    const payload = buildEpc069Payload({
      bic: "  HELADEF1WEM  ",
      name: "Folge der Wolke e.V.",
      iban: "DE43830654089999999999",
      amountCents: 100,
      remittance: "x",
    });

    expect(payload.split("\n")[4]).toBe("HELADEF1WEM");
  });

  it("formats amounts with two decimal places and a dot separator", () => {
    const cases: Array<[number, string]> = [
      [0, "EUR0.00"],
      [1, "EUR0.01"],
      [99, "EUR0.99"],
      [100, "EUR1.00"],
      [12345, "EUR123.45"],
      [119000, "EUR1190.00"],
      [123456789, "EUR1234567.89"],
    ];
    for (const [cents, expected] of cases) {
      const payload = buildEpc069Payload({
        bic: "HELADEF1WEM",
        name: "X",
        iban: "DE00",
        amountCents: cents,
        remittance: "r",
      });
      expect(payload.split("\n")[7]).toBe(expected);
    }
  });

  it("uses LF line separators (no CRLF — EPC spec mandates LF)", () => {
    const payload = buildEpc069Payload({
      bic: "HELADEF1WEM",
      name: "Folge der Wolke e.V.",
      iban: "DE43830654089999999999",
      amountCents: 5000,
      remittance: "Test",
    });
    expect(payload).not.toContain("\r");
    expect(payload.split("\n").length).toBeGreaterThanOrEqual(11);
  });

  it("rejects negative amounts", () => {
    expect(() =>
      buildEpc069Payload({
        bic: "HELADEF1WEM",
        name: "X",
        iban: "DE00",
        amountCents: -1,
        remittance: "r",
      }),
    ).toThrow();
  });

  it("rejects non-integer amounts (cents must be integer)", () => {
    expect(() =>
      buildEpc069Payload({
        bic: "HELADEF1WEM",
        name: "X",
        iban: "DE00",
        amountCents: 12.5,
        remittance: "r",
      }),
    ).toThrow();
  });
});
