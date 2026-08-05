/**
 * @vitest-environment node
 * @phase-aurora-slice4
 * Überweisungsliste copy helpers: bank-form field ORDER (Empfängername →
 * IBAN → Betrag → Verwendungszweck), member vs extern resolution, plain
 * comma-decimal Betrag, 140-char Verwendungszweck cap (SEPA limit).
 */
import { describe, it, expect } from "vitest";
import { claimName, claimBetragText } from "$lib/domain/ueberweisung.js";

const member = {
  betragCents: 8450,
  bezahltVonKind: "member",
  bezahltVonDisplay: "Felix Beispiel",
  externName: null,
};
const extern = {
  betragCents: 8450,
  bezahltVonKind: "extern",
  bezahltVonDisplay: "Extern",
  externName: "Externe Helferin",
};

describe("Werkstatt bank-field helpers", () => {
  it("uses the extern payer's OWN name — Verification-of-Payee rejects a mismatch", () => {
    expect(claimName(extern)).toBe("Externe Helferin");
  });

  it("falls back to the display name for a member", () => {
    expect(claimName(member)).toBe("Felix Beispiel");
  });

  it("falls back to the display name when an extern row has no name", () => {
    expect(claimName({ ...extern, externName: null })).toBe("Extern");
  });

  it("renders the amount the way a bank form wants it — no currency symbol", () => {
    expect(claimBetragText(member)).toBe("84,50");
    expect(claimBetragText({ betragCents: 100000 })).toBe("1000,00");
  });
});

/**
 * claimIban / claimZweck / claimCopyValue / COPY_FIELD_* were REMOVED in A-S3,
 * not just untested: claimIban could not see the submission's IBAN snapshot
 * (a member who changed banks would have been paid at the wrong account), and
 * claimZweck was a third Verwendungszweck format the member could not match on
 * their statement. Their replacements are covered by
 * tests/unit/erstattung-iban-gate.test.ts and tests/unit/werkstatt-pool.test.ts.
 */
