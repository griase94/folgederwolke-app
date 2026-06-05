import { describe, it, expect } from "vitest";
import { resolveLayoutYear } from "$lib/server/domain/layout-year.js"; // new pure helper (PAR-05)
import { ALL_YEARS } from "$lib/domain/year.js";

describe("resolveLayoutYear", () => {
  const avail = [2026, 2025, 2024];
  it("passes ALL_YEARS through untouched", () => {
    expect(
      resolveLayoutYear(new URLSearchParams("year=all"), 2026, avail),
    ).toBe(ALL_YEARS);
  });
  it("passes a concrete in-range year through", () => {
    expect(
      resolveLayoutYear(new URLSearchParams("year=2025"), 2026, avail),
    ).toBe(2025);
  });
  it("clamps a concrete out-of-range year to nearest available", () => {
    expect(
      resolveLayoutYear(new URLSearchParams("year=2099"), 2026, avail),
    ).toBe(2026);
  });
  it("defaults missing to current", () => {
    expect(resolveLayoutYear(new URLSearchParams(""), 2026, avail)).toBe(2026);
  });
});
