/**
 * C9-JUL-lite: isYearClosed honesty refactor.
 *
 * Pre-refactor `isYearClosed(year)` counted rows with `festgeschrieben_at IS
 * NULL` across expenses/income/donations — which silently returned `true`
 * for any year that had no bookings at all (zero rows match zero "open"
 * rows). That false-positive hid the "Erste Buchung anlegen" CTA on a
 * never-used 2025 in production. The authoritative signal is
 * `settings.festgeschrieben_bis` — the date up to which the year is locked.
 */

import { describe, it, expect } from "vitest";
import { isYearClosed } from "$lib/server/domain/jahresabschluss.js";

describe("isYearClosed honesty", () => {
  it("returns true for a year with festgeschriebenBis covering it", async () => {
    const closed = await isYearClosed(2024, {
      festgeschriebenBis: new Date("2024-12-31T23:59:59Z"),
    });
    expect(closed).toBe(true);
  });

  it("returns false for a year AFTER festgeschriebenBis even when no rows exist", async () => {
    // The bug we're fixing: pre-refactor, isYearClosed(2025) returned true
    // when expenses/income/donations for 2025 were all empty, because the
    // query counted "rows without festgeschrieben_at" — zero rows looks
    // identical to all-rows-stamped. New honesty: derive from settings.
    const closed = await isYearClosed(2025, {
      festgeschriebenBis: new Date("2024-12-31T23:59:59Z"),
    });
    expect(closed).toBe(false);
  });

  it("returns false when no festgeschriebenBis is set (null)", async () => {
    const closed = await isYearClosed(2024, { festgeschriebenBis: null });
    expect(closed).toBe(false);
  });

  it("accepts a numeric-year festgeschriebenBis (legacy format)", async () => {
    // Some call sites historically passed the year number directly (e.g. 2024)
    // rather than a Date. The refactor must accept both for backwards-compat.
    const closedFor2024 = await isYearClosed(2024, {
      festgeschriebenBis: 2024,
    });
    const closedFor2025 = await isYearClosed(2025, {
      festgeschriebenBis: 2024,
    });
    expect(closedFor2024).toBe(true);
    expect(closedFor2025).toBe(false);
  });
});
