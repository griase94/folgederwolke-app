/**
 * @vitest-environment node
 * @phase-c3
 *
 * Unit tests for the client-safe cashflow helpers in $lib/domain/cashflow.ts
 * (moved here from $lib/server/domain/dashboard.ts in cycle 2 so the
 * components can import without dragging Drizzle into the client bundle).
 */

import { describe, it, expect } from "vitest";
import {
  computeLyDeltaPct,
  bucketByMonth,
  clampMonthlyForCurrentYear,
} from "$lib/domain/cashflow.js";

describe("computeLyDeltaPct (client-safe re-home)", () => {
  it("returns +50 for a 50% increase", () => {
    expect(computeLyDeltaPct(1500000, 1000000)).toBe(50);
  });
  it("returns null when previous is zero", () => {
    expect(computeLyDeltaPct(1500000, 0)).toBeNull();
  });
});

describe("bucketByMonth (client-safe re-home)", () => {
  it("places amounts in their 0-indexed month bucket", () => {
    const result = bucketByMonth([
      { month: 1, sumCents: 1000 },
      { month: 12, sumCents: 12000 },
    ]);
    expect(result[0]).toBe(1000);
    expect(result[11]).toBe(12000);
  });
});

describe("clampMonthlyForCurrentYear (C3-5, cycle 2)", () => {
  const data = [
    100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200,
  ];

  it("returns full 12 entries for past years", () => {
    const out = clampMonthlyForCurrentYear(data, 2023, 2024, 6);
    expect(out.length).toBe(12);
    expect(out).toEqual(data);
  });

  it("clips to the current month for the current year (May → 5)", () => {
    const out = clampMonthlyForCurrentYear(data, 2024, 2024, 5);
    expect(out.length).toBe(5);
    expect(out).toEqual([100, 200, 300, 400, 500]);
  });

  it("returns at least 1 entry when month is < 1 (defensive)", () => {
    const out = clampMonthlyForCurrentYear(data, 2024, 2024, 0);
    expect(out.length).toBe(1);
  });

  it("caps at 12 when month is > 12 (defensive)", () => {
    const out = clampMonthlyForCurrentYear(data, 2024, 2024, 15);
    expect(out.length).toBe(12);
  });

  it("returns the same array (full) for FUTURE selected years", () => {
    // Edge case: selectedYear > currentYear — show all months (planning view).
    const out = clampMonthlyForCurrentYear(data, 2026, 2024, 5);
    expect(out.length).toBe(12);
  });
});
