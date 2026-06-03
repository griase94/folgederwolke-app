/**
 * Tests for berlinYmd() helper (B1 fix — ADR-0001).
 *
 * The bug: new Date().toISOString().slice(0,10) returns a UTC date string.
 * At 23:59 Europe/Berlin on Dec 31, toISOString() is still the same day
 * (CET=UTC+1), but at 00:01 Berlin on Jan 1 of the new year, toISOString()
 * would be the previous day at 23:01 UTC — wrong Buchungsjahr.
 *
 * berlinYmd() uses Intl.DateTimeFormat with Europe/Berlin timezone so it
 * always returns the correct Berlin-local YYYY-MM-DD.
 *
 * @phase-0
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { berlinYmd, berlinYear } from "$lib/domain/year.js";

describe("@phase-0 berlinYmd / berlinYear (B1 regression)", () => {
  afterEach(() => vi.useRealTimers());

  it("returns current year for a Berlin-noon UTC instant on Dec 31", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T11:00:00Z")); // 12:00 Berlin (CET=UTC+1)
    expect(berlinYmd()).toBe("2026-12-31");
    expect(berlinYear()).toBe(2026);
  });

  it("returns 2026-12-31 for 23:59 Berlin on Dec 31 (22:59 UTC)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T22:59:00Z")); // 23:59 Berlin (CET)
    expect(berlinYmd()).toBe("2026-12-31");
    expect(berlinYear()).toBe(2026);
  });

  it("returns 2027-01-01 for 00:01 Berlin on Jan 1 2027 — the UTC-slice bug case", () => {
    vi.useFakeTimers();
    // 2026-12-31 23:01 UTC = 2027-01-01 00:01 CET (Berlin)
    vi.setSystemTime(new Date("2026-12-31T23:01:00Z"));
    expect(berlinYmd()).toBe("2027-01-01");
    expect(berlinYear()).toBe(2027);
    // Note: new Date().toISOString().slice(0,10) would return "2026-12-31" — the bug!
  });

  it("accepts an explicit Date argument", () => {
    const d = new Date("2025-03-15T10:00:00Z"); // 11:00 Berlin
    expect(berlinYmd(d)).toBe("2025-03-15");
  });
});
