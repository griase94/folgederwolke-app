import { describe, it, expect } from "vitest";
import { parseBetragCents } from "./parse-betrag.js";

describe("parseBetragCents", () => {
  it("12,50 → 1250 (German decimal)", () => {
    expect(parseBetragCents("12,50")).toBe(1250);
  });

  it("1.000,50 → 100050 (German thousands + decimal)", () => {
    expect(parseBetragCents("1.000,50")).toBe(100050);
  });

  it("1.000 → 100000 (German thousands, no decimal)", () => {
    expect(parseBetragCents("1.000")).toBe(100000);
  });

  it("12.50 → 1250 (English decimal)", () => {
    expect(parseBetragCents("12.50")).toBe(1250);
  });

  it("1,000.50 → 100050 (English thousands + decimal)", () => {
    expect(parseBetragCents("1,000.50")).toBe(100050);
  });

  it("1000 → 100000 (plain integer)", () => {
    expect(parseBetragCents("1000")).toBe(100000);
  });

  it("100 → 10000 (plain integer)", () => {
    expect(parseBetragCents("100")).toBe(10000);
  });

  it("0,99 → 99", () => {
    expect(parseBetragCents("0,99")).toBe(99);
  });

  it("1.000.000,99 → 100000099 (German thousands × 2)", () => {
    expect(parseBetragCents("1.000.000,99")).toBe(100000099);
  });

  it("-5 → NaN (negatives rejected, not sign-stripped)", () => {
    expect(parseBetragCents("-5")).toBeNaN();
  });
});
