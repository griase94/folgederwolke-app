/**
 * CSV importer number parsing (F30).
 *
 * The importer's parseGermanNumber must treat a dot-only German thousands
 * value ("1.234") as 1234, not as the English decimal 1.234 (which previously
 * produced a ×1000 under-count once converted to cents). The English decimal
 * shape ("12.50") and the mixed/comma cases must keep working.
 */

import { describe, it, expect } from "vitest";
import {
  parseGermanNumber,
  parseCentsFromAnything,
} from "../../src/lib/server/import/csv-parser.js";

describe("parseGermanNumber — dot-only disambiguation (F30)", () => {
  it("treats a dot-only thousands group as thousands, not decimal", () => {
    // Regression: "1.234" previously parsed to 1.234 → 123 cents.
    expect(parseGermanNumber("1.234")).toBe(1234);
    expect(parseCentsFromAnything("1.234")).toBe(123400);
  });

  it("strips repeated thousands groups", () => {
    expect(parseGermanNumber("1.234.567")).toBe(1234567);
    expect(parseCentsFromAnything("1.000")).toBe(100000);
  });

  it("keeps a single dot with 1-2 trailing digits as an English decimal", () => {
    expect(parseGermanNumber("12.50")).toBe(12.5);
    expect(parseCentsFromAnything("12.50")).toBe(1250);
    expect(parseCentsFromAnything("0.05")).toBe(5);
  });
});

describe("parseGermanNumber — mixed and comma cases (must not regress)", () => {
  it("German thousands + comma decimal", () => {
    expect(parseGermanNumber("1.234,56")).toBe(1234.56);
    expect(parseCentsFromAnything("1.234,56")).toBe(123456);
  });

  it("comma decimal", () => {
    expect(parseGermanNumber("12,50")).toBe(12.5);
    expect(parseCentsFromAnything("12,50")).toBe(1250);
  });

  it("English thousands + dot decimal", () => {
    expect(parseGermanNumber("1,234.56")).toBe(1234.56);
    expect(parseCentsFromAnything("1,234.56")).toBe(123456);
  });

  it("plain integer", () => {
    expect(parseGermanNumber("1234")).toBe(1234);
    expect(parseCentsFromAnything("1234")).toBe(123400);
  });

  it("strips currency / whitespace", () => {
    expect(parseGermanNumber("  42 EUR")).toBe(42);
    expect(parseGermanNumber("1.234,56 €")).toBe(1234.56);
  });

  it("returns null on empty / non-numeric", () => {
    expect(parseGermanNumber("")).toBeNull();
    expect(parseCentsFromAnything("")).toBeNull();
  });
});
