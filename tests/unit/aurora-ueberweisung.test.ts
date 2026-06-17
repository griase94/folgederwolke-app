/**
 * @vitest-environment node
 * @phase-aurora-slice4
 * Überweisungsliste copy helpers: bank-form field ORDER (Empfängername →
 * IBAN → Betrag → Verwendungszweck), member vs extern resolution, plain
 * comma-decimal Betrag, 140-char Verwendungszweck cap (SEPA limit).
 */
import { describe, it, expect } from "vitest";
import {
  COPY_FIELD_ORDER,
  claimIban,
  claimName,
  claimBetragText,
  claimZweck,
} from "$lib/domain/ueberweisung.js";

const member = {
  businessId: "A-2026-007",
  bezeichnung: "Bahnfahrt München",
  betragCents: 8450,
  bezahltVonKind: "member",
  bezahltVonDisplay: "Felix Beispiel",
  externIban: null,
  externName: null,
  memberIban: "DE89370400440532013000",
};
const extern = {
  ...member,
  bezahltVonKind: "extern",
  externIban: "AT611904300234573201",
  externName: "Externe Helferin",
};

describe("Überweisung copy helpers", () => {
  it("field order is the bank-form order (Verification-of-Payee asks the name first)", () => {
    expect(COPY_FIELD_ORDER).toEqual(["name", "iban", "betrag", "zweck"]);
  });

  it("member claims use the member IBAN + display name", () => {
    expect(claimIban(member)).toBe("DE89370400440532013000");
    expect(claimName(member)).toBe("Felix Beispiel");
  });

  it("extern claims use extern IBAN + extern name", () => {
    expect(claimIban(extern)).toBe("AT611904300234573201");
    expect(claimName(extern)).toBe("Externe Helferin");
  });

  it("missing IBAN → null (drives the disabled-copy + 'IBAN fehlt' state)", () => {
    expect(claimIban({ ...member, memberIban: null })).toBeNull();
    expect(claimIban({ ...extern, externIban: null })).toBeNull();
  });

  it("Betrag is a plain comma-decimal string for banking forms (no € symbol)", () => {
    expect(claimBetragText(member)).toBe("84,50");
    expect(claimBetragText({ ...member, betragCents: 100000 })).toBe("1000,00");
  });

  it("Verwendungszweck is '<businessId> <bezeichnung>' capped at 140 chars", () => {
    expect(claimZweck(member)).toBe("A-2026-007 Bahnfahrt München");
    const long = { ...member, bezeichnung: "x".repeat(200) };
    expect(claimZweck(long).length).toBe(140);
  });
});
