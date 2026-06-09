/**
 * Money parse/format helpers (ADR-0003 — integer cents, no floats).
 *
 * Focus: parseEuroToCents separator disambiguation for de-DE input, where a
 * dot is a thousands separator and a comma is the decimal point — while the
 * English fallback ("1234.56") must keep working.
 */

import { describe, it, expect } from "vitest";
import { parseEuroToCents, formatCentsAsEuro, sumCents } from "./money.js";

describe("parseEuroToCents", () => {
  describe("de-DE thousands grouping (dot = thousands sep)", () => {
    it("parses a dot-only grouped integer as thousands, not decimal", () => {
      // Regression: '1.234' previously mis-parsed to 1,23 € (123 cents).
      expect(parseEuroToCents("1.234")).toBe(123400n);
    });

    it("parses grouped amount with comma decimal", () => {
      expect(parseEuroToCents("1.234,56")).toBe(123456n);
    });

    it("strips multiple thousands separators", () => {
      expect(parseEuroToCents("1.234.567")).toBe(123456700n);
      expect(parseEuroToCents("1.234.567,89")).toBe(123456789n);
    });

    it("treats a round 1000 written as '1.000' as one thousand euro", () => {
      expect(parseEuroToCents("1.000")).toBe(100000n);
    });
  });

  describe("comma decimal (de-DE)", () => {
    it("parses '12,50' as 12.50 €", () => {
      expect(parseEuroToCents("12,50")).toBe(1250n);
    });

    it("parses a comma-decimal without grouping", () => {
      expect(parseEuroToCents("0,00")).toBe(0n);
      expect(parseEuroToCents("99,99")).toBe(9999n);
    });
  });

  describe("English fallback (dot = decimal) — must not regress", () => {
    it("parses '1234.56'", () => {
      expect(parseEuroToCents("1234.56")).toBe(123456n);
    });

    it("parses a single dot with one or two trailing digits as decimal", () => {
      expect(parseEuroToCents("12.34")).toBe(1234n);
      expect(parseEuroToCents("12.5")).toBe(1250n);
    });
  });

  describe("plain integers and negatives", () => {
    it("parses an unseparated integer", () => {
      expect(parseEuroToCents("100")).toBe(10000n);
    });

    it("handles a leading minus across all separator styles", () => {
      expect(parseEuroToCents("-12,50")).toBe(-1250n);
      expect(parseEuroToCents("-1.234")).toBe(-123400n);
      expect(parseEuroToCents("-1.234,56")).toBe(-123456n);
    });

    it("trims surrounding whitespace", () => {
      expect(parseEuroToCents("  12,50  ")).toBe(1250n);
    });
  });

  describe("rejects malformed input", () => {
    it("throws on empty input", () => {
      expect(() => parseEuroToCents("   ")).toThrow();
    });

    it("throws on non-numeric input", () => {
      expect(() => parseEuroToCents("abc")).toThrow();
      expect(() => parseEuroToCents("1,2,3")).toThrow();
    });
  });

  describe("round-trips with formatCentsAsEuro", () => {
    it("parse → format → parse is stable for grouped amounts", () => {
      const cents = parseEuroToCents("1.234,56");
      const formatted = formatCentsAsEuro(cents); // "1.234,56 €"
      // Strip the currency suffix and re-parse.
      expect(parseEuroToCents(formatted.replace(/\s*€$/, ""))).toBe(cents);
    });
  });
});

describe("sumCents", () => {
  it("sums an array of bigint cents", () => {
    expect(sumCents([100n, 250n, -50n])).toBe(300n);
  });

  it("returns 0n for an empty array", () => {
    expect(sumCents([])).toBe(0n);
  });
});
