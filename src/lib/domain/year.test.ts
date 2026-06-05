/**
 * C2 — Pure-TS year helpers backing the global year switcher.
 *   - currentBuchungsjahr(): Berlin-TZ current year for default-selection (ADR-0001 mirror)
 *   - selectYearFromUrl(searchParams, fallback): URL ?year=NNNN parser with fallback
 *   - clampYearToAvailable(year, available): coerces an arbitrary year to the closest available one
 *
 * These are pure functions; no DB / no DOM. The server-side "list years from DB"
 * helper lives in src/lib/server/domain/years.ts and is tested separately.
 *
 * Resolves: VB-002 (no year switching), JB-001 (no global year filter), JB-006
 * (URL year param ignored on dashboard), UX-010 (year is implicit).
 */

import { describe, it, expect } from "vitest";
import {
  currentBuchungsjahr,
  selectYearFromUrl,
  clampYearToAvailable,
  yearScopeLabel,
  ALL_YEARS,
} from "./year.js";

describe("C2 — year switching helpers (VB-002 / JB-001 / UX-010)", () => {
  describe("currentBuchungsjahr", () => {
    it("returns a 4-digit positive integer", () => {
      const y = currentBuchungsjahr();
      expect(Number.isInteger(y)).toBe(true);
      expect(y).toBeGreaterThan(2020);
      expect(y).toBeLessThan(2100);
    });

    it("accepts an explicit Date and yields its Berlin year", () => {
      // 2026-05-15 12:00 UTC -> Berlin (CEST) is 14:00, still 2026
      const y = currentBuchungsjahr(new Date("2026-05-15T12:00:00Z"));
      expect(y).toBe(2026);
    });

    it("uses Europe/Berlin TZ at year boundaries (NYE in UTC is already next year in Berlin)", () => {
      // 2026-12-31 23:30 UTC -> Berlin (CET) 00:30 of 2027
      const y = currentBuchungsjahr(new Date("2026-12-31T23:30:00Z"));
      expect(y).toBe(2027);
    });
  });

  describe("selectYearFromUrl", () => {
    it("returns fallback when ?year is absent", () => {
      const params = new URLSearchParams("");
      expect(selectYearFromUrl(params, 2026)).toBe(2026);
    });

    it("parses a numeric ?year param", () => {
      const params = new URLSearchParams("year=2024");
      expect(selectYearFromUrl(params, 2026)).toBe(2024);
    });

    it("returns fallback when ?year is non-numeric garbage", () => {
      const params = new URLSearchParams("year=foo");
      expect(selectYearFromUrl(params, 2026)).toBe(2026);
    });

    it("returns fallback when ?year is out of plausible range", () => {
      expect(selectYearFromUrl(new URLSearchParams("year=999"), 2026)).toBe(
        2026,
      );
      expect(selectYearFromUrl(new URLSearchParams("year=3500"), 2026)).toBe(
        2026,
      );
    });
  });

  describe("clampYearToAvailable", () => {
    it("returns the year unchanged when it is in the list", () => {
      expect(clampYearToAvailable(2025, [2023, 2024, 2025, 2026])).toBe(2025);
    });

    it("returns the largest available year when requested year is above", () => {
      expect(clampYearToAvailable(2030, [2023, 2024, 2025, 2026])).toBe(2026);
    });

    it("returns the smallest available year when requested year is below", () => {
      expect(clampYearToAvailable(2000, [2023, 2024, 2025, 2026])).toBe(2023);
    });

    it("returns the requested year unchanged when available list is empty", () => {
      expect(clampYearToAvailable(2026, [])).toBe(2026);
    });
  });

  describe("yearScopeLabel (item 6 — shared across tab KPIs + empty state)", () => {
    it("renders a concrete year as-is", () => {
      expect(yearScopeLabel(2026)).toBe("2026");
    });

    it("renders the ALL_YEARS sentinel as 'Alle Jahre' (not bare 'Alle')", () => {
      expect(yearScopeLabel(ALL_YEARS)).toBe("Alle Jahre");
    });
  });
});
