/**
 * @phase-2
 *
 * Unit tests for IBAN MOD-97 validator (B7 hardening).
 *
 * Coverage:
 *  - 5 valid IBANs from different SEPA countries
 *  - 5 invalid IBANs (bad checksum, bad length, non-SEPA, garbage)
 *  - normalization (spaces, lowercase)
 */

import { describe, it, expect } from "vitest";
import { validateIban, normalizeIban } from "./iban.js";

describe("validateIban — valid SEPA IBANs", () => {
  // These are canonical test IBANs from public examples. Each has a verified
  // MOD-97 checksum of 1.
  const valid: Array<[string, string]> = [
    ["Germany", "DE89370400440532013000"],
    ["France", "FR1420041010050500013M02606"],
    ["UK", "GB29NWBK60161331926819"],
    ["Italy", "IT60X0542811101000000123456"],
    ["Spain", "ES9121000418450200051332"],
  ];

  for (const [country, iban] of valid) {
    it(`accepts ${country} IBAN ${iban}`, () => {
      expect(validateIban(iban)).toBe(true);
    });
  }

  it("accepts an IBAN with spaces", () => {
    expect(validateIban("DE89 3704 0044 0532 0130 00")).toBe(true);
  });

  it("accepts an IBAN with lowercase letters", () => {
    expect(validateIban("de89370400440532013000")).toBe(true);
  });
});

describe("validateIban — invalid IBANs", () => {
  it("rejects an IBAN with a tampered check digit", () => {
    // Same as valid DE IBAN but check digits flipped 89 → 90
    expect(validateIban("DE90370400440532013000")).toBe(false);
  });

  it("rejects an IBAN that is too short for its country", () => {
    // DE expects 22 chars
    expect(validateIban("DE8937040044")).toBe(false);
  });

  it("rejects an IBAN that is too long for its country", () => {
    expect(validateIban("DE89370400440532013000XXXX")).toBe(false);
  });

  it("rejects a non-SEPA country (US)", () => {
    // United States is not in the SEPA list, so this must reject regardless
    // of checksum.
    expect(validateIban("US12345678901234567890")).toBe(false);
  });

  it("rejects an IBAN containing invalid characters", () => {
    expect(validateIban("DE89-3704-0044-0532-013000")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(validateIban("")).toBe(false);
  });

  it("rejects an IBAN with non-string input", () => {
    expect(validateIban(123 as unknown as string)).toBe(false);
  });
});

describe("normalizeIban", () => {
  it("strips whitespace and uppercases", () => {
    expect(normalizeIban("de89 3704 0044\t0532 0130 00")).toBe(
      "DE89370400440532013000",
    );
  });
});
