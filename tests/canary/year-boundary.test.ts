// @canary
import { describe, expect, it } from "vitest";
import { yearForBooking } from "$lib/domain/year";

describe("canary: year-boundary at Berlin midnight", () => {
  it("2026-12-31T23:59:59+01:00 → 2026", () => {
    expect(yearForBooking(new Date("2026-12-31T23:59:59+01:00"))).toBe(2026);
  });
  it("2027-01-01T00:00:01+01:00 → 2027", () => {
    expect(yearForBooking(new Date("2027-01-01T00:00:01+01:00"))).toBe(2027);
  });
});
