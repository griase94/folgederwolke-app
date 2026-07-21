import { describe, expect, it } from "vitest";
import { formatDatumDe, leistungszeitraumFromDatum } from "./datum.js";

describe("formatDatumDe", () => {
  it("formats a bare ISO date zero-padded dd.mm.yyyy without a TZ shift", () => {
    expect(formatDatumDe("2026-03-10")).toBe("10.03.2026");
    expect(formatDatumDe("2026-01-01")).toBe("01.01.2026");
  });
});

describe("leistungszeitraumFromDatum", () => {
  it("derives the German long month + year from a bare ISO date", () => {
    expect(leistungszeitraumFromDatum("2026-02-15")).toBe("Februar 2026");
    expect(leistungszeitraumFromDatum("2026-07-01")).toBe("Juli 2026");
    expect(leistungszeitraumFromDatum("2026-12-31")).toBe("Dezember 2026");
  });

  it("uses the calendar month for boundary dates (no UTC parse shift)", () => {
    // A naive `new Date("2026-03-01")` is UTC midnight → Feb 28 in Berlin-.
    // The part-by-part read keeps it in March.
    expect(leistungszeitraumFromDatum("2026-03-01")).toBe("März 2026");
    expect(leistungszeitraumFromDatum("2026-01-31")).toBe("Januar 2026");
  });

  it("returns empty string for empty or unparseable input", () => {
    expect(leistungszeitraumFromDatum("")).toBe("");
    expect(leistungszeitraumFromDatum("not-a-date")).toBe("");
    expect(leistungszeitraumFromDatum("2026-13-01")).toBe("");
  });
});
