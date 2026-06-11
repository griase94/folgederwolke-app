/**
 * @phase-2
 *
 * C1 cycle 2 — server-side composer for the EÜR workspace data payload.
 *
 * `composeEurWorkspaceData` takes pre-fetched EurRows (current + prior year),
 * monthly buckets, and pre-flight counters, and produces the exact shape the
 * +layout.server.ts will serialize to the client. Pure function, no DB.
 */

import { describe, it, expect } from "vitest";
import { composeEurWorkspaceData } from "$lib/server/eur/load.js";
import type { EurRow } from "$lib/server/domain/eur.js";

function makeRow(overrides: Partial<EurRow> = {}): EurRow {
  return {
    businessId: "X-2025-001",
    gebuchtAm: new Date("2025-04-10"),
    relevanzDatum: null,
    betragCents: 10000n,
    sphereSnapshot: "ideeller",
    kategorieId: null,
    kategorieNameSnapshot: "Test",
    eurZeile: null,
    anlageGemZeile: null,
    bezeichnung: "row",
    belegDriveFileId: null,
    belegOriginalName: null,
    ...overrides,
  };
}

describe("composeEurWorkspaceData", () => {
  it("returns 4 spheres in canonical order", () => {
    const out = composeEurWorkspaceData({
      year: 2025,
      priorYear: 2024,
      currentEinnahmen: [],
      currentAusgaben: [],
      priorEinnahmen: [],
      priorAusgaben: [],
      monthlyRows: [],
      preFlight: {
        year: 2025,
        uncategorizedCount: 0,
        missingBelegCount: 0,
        draftInvoiceCount: 0,
        auditInboxQueueCount: 0,
        festgeschriebenBis: null,
        totalIncomeRows: 0,
        totalExpenseRows: 0,
      },
      vereinName: "Test e.V.",
      closed: false,
      spendenCount: 0,
    });
    expect(out.sphereYoY.map((r) => r.sphere)).toEqual([
      "ideeller",
      "vermoegen",
      "zweckbetrieb",
      "wirtschaftlich",
    ]);
    expect(Object.keys(out.eur.bySphere)).toEqual(
      expect.arrayContaining([
        "ideeller",
        "vermoegen",
        "zweckbetrieb",
        "wirtschaftlich",
      ]),
    );
  });

  it("computes YoY from prior vs current rows per sphere", () => {
    const current = [
      makeRow({ sphereSnapshot: "ideeller", betragCents: 20000n }),
    ];
    const prior = [
      makeRow({ sphereSnapshot: "ideeller", betragCents: 10000n }),
    ];
    const out = composeEurWorkspaceData({
      year: 2025,
      priorYear: 2024,
      currentEinnahmen: current,
      currentAusgaben: [],
      priorEinnahmen: prior,
      priorAusgaben: [],
      monthlyRows: [],
      preFlight: {
        year: 2025,
        uncategorizedCount: 0,
        missingBelegCount: 0,
        draftInvoiceCount: 0,
        auditInboxQueueCount: 0,
        festgeschriebenBis: null,
        totalIncomeRows: 1,
        totalExpenseRows: 0,
      },
      vereinName: "Test e.V.",
      closed: false,
      spendenCount: 0,
    });
    const ideeller = out.sphereYoY.find((r) => r.sphere === "ideeller")!;
    expect(ideeller.einnahmenCents).toBe(20000);
    expect(ideeller.yoyEinnahmen.absCents).toBe(10000);
    expect(ideeller.yoyEinnahmen.pct).toBe(100);
  });

  it("produces a length-12 monthlyOverschuss array", () => {
    const out = composeEurWorkspaceData({
      year: 2025,
      priorYear: 2024,
      currentEinnahmen: [],
      currentAusgaben: [],
      priorEinnahmen: [],
      priorAusgaben: [],
      monthlyRows: [
        { art: "income", month: 1, sumCents: 1000 },
        { art: "expense", month: 12, sumCents: 200 },
      ],
      preFlight: {
        year: 2025,
        uncategorizedCount: 0,
        missingBelegCount: 0,
        draftInvoiceCount: 0,
        auditInboxQueueCount: 0,
        festgeschriebenBis: null,
        totalIncomeRows: 0,
        totalExpenseRows: 0,
      },
      vereinName: "Test e.V.",
      closed: false,
      spendenCount: 0,
    });
    expect(out.monthlyOverschuss).toHaveLength(12);
    expect(out.monthlyOverschuss[0]).toBe(1000);
    expect(out.monthlyOverschuss[11]).toBe(-200);
  });

  it("exposes WGB status for wirtschaftlich Einnahmen", () => {
    const out = composeEurWorkspaceData({
      year: 2025,
      priorYear: 2024,
      currentEinnahmen: [
        makeRow({
          sphereSnapshot: "wirtschaftlich",
          betragCents: 4_000_000n,
        }),
      ],
      currentAusgaben: [],
      priorEinnahmen: [],
      priorAusgaben: [],
      monthlyRows: [],
      preFlight: {
        year: 2025,
        uncategorizedCount: 0,
        missingBelegCount: 0,
        draftInvoiceCount: 0,
        auditInboxQueueCount: 0,
        festgeschriebenBis: null,
        totalIncomeRows: 1,
        totalExpenseRows: 0,
      },
      vereinName: "Test e.V.",
      closed: false,
      spendenCount: 0,
    });
    expect(out.wgb.einnahmenCents).toBe(4_000_000);
    expect(out.wgb.bucket).toBe("warning");
  });

  it("preFlight blockers gate canFestschreiben", () => {
    const out = composeEurWorkspaceData({
      year: 2025,
      priorYear: 2024,
      currentEinnahmen: [],
      currentAusgaben: [],
      priorEinnahmen: [],
      priorAusgaben: [],
      monthlyRows: [],
      preFlight: {
        year: 2025,
        uncategorizedCount: 3,
        missingBelegCount: 0,
        draftInvoiceCount: 0,
        auditInboxQueueCount: 0,
        festgeschriebenBis: null,
        totalIncomeRows: 10,
        totalExpenseRows: 10,
      },
      vereinName: "Test e.V.",
      closed: false,
      spendenCount: 0,
    });
    expect(out.preFlight.canFestschreiben).toBe(false);
    expect(out.preFlight.blockers).toBeGreaterThanOrEqual(1);
  });

  it("totals come back as numbers (not bigint) for SvelteKit serialization", () => {
    const out = composeEurWorkspaceData({
      year: 2025,
      priorYear: 2024,
      currentEinnahmen: [
        makeRow({ sphereSnapshot: "ideeller", betragCents: 12345n }),
      ],
      currentAusgaben: [
        makeRow({ sphereSnapshot: "ideeller", betragCents: 5n }),
      ],
      priorEinnahmen: [],
      priorAusgaben: [],
      monthlyRows: [],
      preFlight: {
        year: 2025,
        uncategorizedCount: 0,
        missingBelegCount: 0,
        draftInvoiceCount: 0,
        auditInboxQueueCount: 0,
        festgeschriebenBis: null,
        totalIncomeRows: 1,
        totalExpenseRows: 1,
      },
      vereinName: "Test e.V.",
      closed: false,
      spendenCount: 0,
    });
    expect(typeof out.eur.totalEinnahmenCents).toBe("number");
    expect(typeof out.eur.totalAusgabenCents).toBe("number");
    expect(typeof out.eur.totalUeberschussCents).toBe("number");
    expect(typeof out.priorEur.totalUeberschussCents).toBe("number");
    expect(out.eur.totalEinnahmenCents).toBe(12345);
  });

  it("exposes tab metadata for the UI shell", () => {
    const out = composeEurWorkspaceData({
      year: 2025,
      priorYear: 2024,
      currentEinnahmen: [],
      currentAusgaben: [],
      priorEinnahmen: [],
      priorAusgaben: [],
      monthlyRows: [],
      preFlight: {
        year: 2025,
        uncategorizedCount: 0,
        missingBelegCount: 0,
        draftInvoiceCount: 0,
        auditInboxQueueCount: 0,
        festgeschriebenBis: null,
        totalIncomeRows: 0,
        totalExpenseRows: 0,
      },
      vereinName: "Test e.V.",
      closed: false,
      spendenCount: 0,
    });
    expect(out.tabs).toBeDefined();
    expect(out.tabs.map((t) => t.id)).toEqual([
      "uebersicht",
      "buchungsliste",
      "spenden",
      "exports",
    ]);
    expect(
      out.tabs.every((t) => t.href.includes("/jahresabschluss/2025")),
    ).toBe(true);
  });
});
