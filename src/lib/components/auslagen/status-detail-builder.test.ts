import { describe, it, expect } from "vitest";
import {
  buildNodeDetail,
  buildSingleAside,
  type StatusNode,
} from "./status-detail-builder.js";

function node(over: Partial<StatusNode> = {}): StatusNode {
  return {
    ausId: "AUS-2026-0071",
    bezeichnung: "Getränke fürs Sommerfest",
    betragCents: 2490,
    status: "in_pruefung",
    submittedAt: "2026-07-04T09:04:00.000Z",
    decidedAt: null,
    rechnungsdatum: "2026-07-04",
    erstattetAm: null,
    rejectReason: null,
    maskedIban: "****4321",
    belegFileName: "beleg.jpg",
    ...over,
  };
}

describe("buildNodeDetail", () => {
  it("INVARIANT: the Betrag row is always plum (tone ausgabe), in every status", () => {
    for (const status of [
      "eingegangen",
      "in_pruefung",
      "geprueft",
      "erstattet",
      "abgelehnt",
    ] as const) {
      const detail = buildNodeDetail(
        node({
          status,
          erstattetAm: "2026-07-11",
          decidedAt: "2026-07-06",
          rejectReason: "x",
        }),
      );
      const betrag = detail.factsRows.find((r) => r.label === "Betrag");
      expect(betrag?.variant).toBe("amount");
      expect(betrag?.tone).toBe("ausgabe");
    }
  });

  it("rejected → ReasonBox data + recovery href, no next-step", () => {
    const detail = buildNodeDetail(
      node({
        status: "abgelehnt",
        decidedAt: "2026-06-08",
        rejectReason: "Beleg unscharf.",
      }),
    );
    expect(detail.reject?.reason).toBe("Beleg unscharf.");
    expect(detail.recoveryHref).toBe("/auslage-einreichen");
    expect(detail.nextStep).toBeNull();
  });

  it("non-rejected → a next-step callout, no reject box", () => {
    const detail = buildNodeDetail(node({ status: "in_pruefung" }));
    expect(detail.nextStep).not.toBeNull();
    expect(detail.reject).toBeNull();
  });

  it("in_pruefung timeline carries a 'now' step (brand-neutral, never amber)", () => {
    const detail = buildNodeDetail(node({ status: "in_pruefung" }));
    expect(detail.timeline.some((e) => e.state === "now")).toBe(true);
  });

  it("erstattet facts show 'Überwiesen am' + drop the Rechnungsdatum row", () => {
    const detail = buildNodeDetail(
      node({
        status: "erstattet",
        decidedAt: "2026-07-06",
        erstattetAm: "2026-07-11",
      }),
    );
    const labels = detail.factsRows.map((r) => r.label);
    expect(labels).toContain("Überwiesen am");
    expect(labels).not.toContain("Rechnungsdatum");
  });

  it("abgelehnt facts drop the IBAN (plate)", () => {
    const detail = buildNodeDetail(
      node({ status: "abgelehnt", decidedAt: "2026-06-08", rejectReason: "x" }),
    );
    expect(detail.factsRows.some((r) => r.variant === "iban")).toBe(false);
  });
});

describe("buildSingleAside", () => {
  it("gives every status a headline + eyebrow", () => {
    for (const status of [
      "eingegangen",
      "in_pruefung",
      "geprueft",
      "erstattet",
      "abgelehnt",
    ] as const) {
      const a = buildSingleAside(node({ status }));
      expect(a.eyebrow.length).toBeGreaterThan(0);
      expect(a.headline.length).toBeGreaterThan(0);
    }
  });
});
