import { describe, it, expect } from "vitest";
import { deriveStatus, maskIban } from "./auslage-status.js";

const D = (s: string) => new Date(s);

describe("deriveStatus", () => {
  it("eingegangen — not reviewed, not decided", () => {
    expect(
      deriveStatus({
        decision: null,
        decidedAt: null,
        reviewedAt: null,
        erstattetAm: null,
      }),
    ).toBe("eingegangen");
  });

  it("in_pruefung — reviewed but not decided", () => {
    expect(
      deriveStatus({
        decision: null,
        decidedAt: null,
        reviewedAt: D("2026-01-02T10:00:00Z"),
        erstattetAm: null,
      }),
    ).toBe("in_pruefung");
  });

  it("geprueft — approved, awaiting transfer", () => {
    expect(
      deriveStatus({
        decision: "approved",
        decidedAt: D("2026-01-03T10:00:00Z"),
        reviewedAt: D("2026-01-02T10:00:00Z"),
        erstattetAm: null,
      }),
    ).toBe("geprueft");
  });

  it("erstattet — approved AND linked expense reimbursed", () => {
    expect(
      deriveStatus({
        decision: "approved",
        decidedAt: D("2026-01-03T10:00:00Z"),
        reviewedAt: D("2026-01-02T10:00:00Z"),
        erstattetAm: "2026-01-05",
      }),
    ).toBe("erstattet");
  });

  it("abgelehnt — rejected wins even if reviewed", () => {
    expect(
      deriveStatus({
        decision: "rejected",
        decidedAt: D("2026-01-03T10:00:00Z"),
        reviewedAt: D("2026-01-02T10:00:00Z"),
        erstattetAm: null,
      }),
    ).toBe("abgelehnt");
  });

  it("decidedAt without a decision string falls through to geprueft", () => {
    // Defensive: a decided row with a null/unknown decision is treated as
    // geprueft (approved-awaiting), never mis-labelled as erstattet/abgelehnt.
    expect(
      deriveStatus({
        decision: null,
        decidedAt: D("2026-01-03T10:00:00Z"),
        reviewedAt: null,
        erstattetAm: null,
      }),
    ).toBe("geprueft");
  });
});

describe("maskIban", () => {
  it("keeps only the last 4 characters, stars the rest", () => {
    expect(maskIban("DE89370400440532013000")).toBe("******************3000");
  });

  it("returns **** for degenerate short inputs", () => {
    expect(maskIban("")).toBe("****");
    expect(maskIban("DE12")).toBe("****");
  });

  it("never leaks more than the last 4 characters", () => {
    const masked = maskIban("DE89370400440532013000");
    expect(masked.endsWith("3000")).toBe(true);
    expect(masked.replace(/\*/g, "")).toBe("3000");
  });
});
