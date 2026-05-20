/**
 * @phase-2
 *
 * C1 cycle 2 — C1-H2 — EÜR Einnahmen union over income + donations + member_beitrags.
 *
 * Without this union, ~60-80% of a typical Verein's ideelle Einnahmen are
 * silently dropped from the workspace EÜR. The dashboard cashflow already
 * does this 3-source union (C3 cycle-2 fix). This test asserts the EÜR
 * composer now mirrors that behavior.
 *
 * BMF: Anlage EÜR Zeilen 2 (Mitgliedsbeiträge) + 4 (Spenden) — both ideeller.
 */

import { describe, it, expect } from "vitest";
import { composeEurWorkspaceData } from "$lib/server/eur/load.js";
import type { EurRow } from "$lib/server/domain/eur.js";

function makeRow(overrides: Partial<EurRow> = {}): EurRow {
  return {
    businessId: "X-2025-001",
    gebuchtAm: new Date("2025-04-10"),
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

function basePreFlight() {
  return {
    year: 2025,
    uncategorizedCount: 0,
    missingBelegCount: 0,
    missingBescheinigungenCount: 0,
    draftInvoiceCount: 0,
    auditInboxQueueCount: 0,
    festgeschriebenBis: null,
    totalIncomeRows: 1,
    totalExpenseRows: 0,
    totalDonationRows: 1,
    totalBeitragRows: 1,
    currentBuchungsjahr: 2025,
  };
}

describe("composeEurWorkspaceData — C1-H2 Einnahmen union", () => {
  it("unions income + donations + member-beitrags onto ideeller einnahmen", () => {
    const out = composeEurWorkspaceData({
      year: 2025,
      priorYear: 2024,
      currentEinnahmen: [
        makeRow({ sphereSnapshot: "ideeller", betragCents: 1000n }),
      ],
      currentAusgaben: [],
      priorEinnahmen: [],
      priorAusgaben: [],
      currentSpenden: [
        makeRow({ sphereSnapshot: "ideeller", betragCents: 5000n }),
      ],
      currentBeitrags: [
        makeRow({ sphereSnapshot: "ideeller", betragCents: 6969n }),
      ],
      monthlyRows: [],
      preFlight: basePreFlight(),
      vereinName: "Test e.V.",
      closed: false,
      spendenCount: 1,
    });
    expect(out.eur.bySphere.ideeller.einnahmenCents).toBe(12969);
    expect(out.eur.totalEinnahmenCents).toBe(12969);
  });

  it("respects sphereSnapshot per donation row (no sphere coercion)", () => {
    // Some donations may be zweckbetrieb (e.g. Tombola) — must not be folded
    // into ideeller. The mapper preserves the donation's own sphereSnapshot.
    const out = composeEurWorkspaceData({
      year: 2025,
      priorYear: 2024,
      currentEinnahmen: [],
      currentAusgaben: [],
      priorEinnahmen: [],
      priorAusgaben: [],
      currentSpenden: [
        makeRow({ sphereSnapshot: "zweckbetrieb", betragCents: 4000n }),
      ],
      currentBeitrags: [
        makeRow({ sphereSnapshot: "ideeller", betragCents: 6969n }),
      ],
      monthlyRows: [],
      preFlight: basePreFlight(),
      vereinName: "Test e.V.",
      closed: false,
      spendenCount: 1,
    });
    expect(out.eur.bySphere.ideeller.einnahmenCents).toBe(6969);
    expect(out.eur.bySphere.zweckbetrieb.einnahmenCents).toBe(4000);
  });

  it("prior-year arrays union too — YoY chip on ideeller reflects all 3 sources", () => {
    const out = composeEurWorkspaceData({
      year: 2025,
      priorYear: 2024,
      currentEinnahmen: [
        makeRow({ sphereSnapshot: "ideeller", betragCents: 10000n }),
      ],
      currentAusgaben: [],
      priorEinnahmen: [
        makeRow({ sphereSnapshot: "ideeller", betragCents: 5000n }),
      ],
      priorAusgaben: [],
      currentSpenden: [
        makeRow({ sphereSnapshot: "ideeller", betragCents: 5000n }),
      ],
      priorSpenden: [
        makeRow({ sphereSnapshot: "ideeller", betragCents: 2500n }),
      ],
      currentBeitrags: [],
      priorBeitrags: [],
      monthlyRows: [],
      preFlight: basePreFlight(),
      vereinName: "Test e.V.",
      closed: false,
      spendenCount: 1,
    });
    const ideeller = out.sphereYoY.find((r) => r.sphere === "ideeller")!;
    expect(ideeller.einnahmenCents).toBe(15000); // 10000 + 5000
    expect(ideeller.yoyEinnahmen.absCents).toBe(15000 - 7500);
  });

  it("backwards compatible: no currentSpenden/currentBeitrags supplied → only income counted", () => {
    const out = composeEurWorkspaceData({
      year: 2025,
      priorYear: 2024,
      currentEinnahmen: [
        makeRow({ sphereSnapshot: "ideeller", betragCents: 1000n }),
      ],
      currentAusgaben: [],
      priorEinnahmen: [],
      priorAusgaben: [],
      monthlyRows: [],
      preFlight: basePreFlight(),
      vereinName: "Test e.V.",
      closed: false,
      spendenCount: 0,
    });
    expect(out.eur.bySphere.ideeller.einnahmenCents).toBe(1000);
  });
});
