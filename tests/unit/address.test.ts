import { describe, it, expect } from "vitest";
import { addressLines, addressOneLine } from "$lib/server/domain/address.js";

describe("addressLines", () => {
  it("splits a real-newline multi-line address into stacked lines", () => {
    expect(
      addressLines("c/o Jonas Hackenberg\nWestermühlstraße 6\n80469 München"),
    ).toEqual(["c/o Jonas Hackenberg", "Westermühlstraße 6", "80469 München"]);
  });

  it("normalises a literal backslash-n (escaped) value", () => {
    expect(
      addressLines("c/o Jonas Hackenberg\\nWestermühlstraße 6\\n80469 München"),
    ).toEqual(["c/o Jonas Hackenberg", "Westermühlstraße 6", "80469 München"]);
  });

  it("trims whitespace and drops blank lines", () => {
    expect(addressLines("  Westermühlstraße 6 \n\n  80469 München  ")).toEqual([
      "Westermühlstraße 6",
      "80469 München",
    ]);
  });

  it("keeps a legacy comma single-line value as ONE line (no comma split)", () => {
    expect(addressLines("Westermühlstraße 6, 80469 München")).toEqual([
      "Westermühlstraße 6, 80469 München",
    ]);
  });

  it("returns an empty array for empty/null/undefined", () => {
    expect(addressLines("")).toEqual([]);
    expect(addressLines(null)).toEqual([]);
    expect(addressLines(undefined)).toEqual([]);
  });
});

describe("addressOneLine", () => {
  it("joins lines with a middot by default", () => {
    expect(
      addressOneLine("c/o Jonas Hackenberg\nWestermühlstraße 6\n80469 München"),
    ).toBe("c/o Jonas Hackenberg · Westermühlstraße 6 · 80469 München");
  });

  it("accepts a custom separator", () => {
    expect(addressOneLine("Westermühlstraße 6\n80469 München", ", ")).toBe(
      "Westermühlstraße 6, 80469 München",
    );
  });

  it("is empty for an empty address", () => {
    expect(addressOneLine("")).toBe("");
  });
});
