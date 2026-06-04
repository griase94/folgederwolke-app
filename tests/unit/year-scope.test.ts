import { describe, it, expect } from "vitest";
import {
  selectYearOrAllFromUrl,
  isStaleYear,
  ALL_YEARS,
} from "$lib/domain/year.js";

describe("year scope (Alle Jahre + stale)", () => {
  it("?year=all → ALL_YEARS sentinel (lists only)", () => {
    expect(selectYearOrAllFromUrl(new URLSearchParams("year=all"), 2026)).toBe(
      ALL_YEARS,
    );
  });
  it("missing/garbage → fallback current year", () => {
    expect(selectYearOrAllFromUrl(new URLSearchParams(""), 2026)).toBe(2026);
    expect(selectYearOrAllFromUrl(new URLSearchParams("year=zzz"), 2026)).toBe(
      2026,
    );
  });
  it("isStaleYear: true only for a concrete past/other year, false for current and for ALL_YEARS", () => {
    expect(isStaleYear(2024, 2026)).toBe(true);
    expect(isStaleYear(2026, 2026)).toBe(false);
    expect(isStaleYear(ALL_YEARS, 2026)).toBe(false);
  });
});
