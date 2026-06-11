/**
 * @phase-6
 *
 * Unit tests for the EÜR domain helpers:
 *   - computeEurYear: sphere aggregation correctness
 *   - aggregateByEurZeile: ELSTER line grouping
 *   - aggregateByAnlageGemZeile: Anlage Gem line grouping
 *   - formatEurCents: German locale formatting
 */

import { describe, it, expect } from "vitest";
import {
  computeEurYear,
  aggregateByEurZeile,
  aggregateByAnlageGemZeile,
  formatEurCents,
  type EurRow,
} from "$lib/server/domain/eur.js";

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeRow(overrides: Partial<EurRow> = {}): EurRow {
  return {
    businessId: "E-2026-001",
    gebuchtAm: new Date("2026-03-15"),
    relevanzDatum: null,
    betragCents: 10000n,
    sphereSnapshot: "ideeller",
    kategorieId: null,
    kategorieNameSnapshot: "Bürobedarf",
    eurZeile: null,
    anlageGemZeile: null,
    bezeichnung: "Testbuchung",
    belegDriveFileId: null,
    belegOriginalName: null,
    ...overrides,
  };
}

// ── computeEurYear ────────────────────────────────────────────────────────────

describe("computeEurYear — sphere aggregation", () => {
  it("sums income by sphere", () => {
    const einnahmen: EurRow[] = [
      makeRow({ sphereSnapshot: "ideeller", betragCents: 50000n }),
      makeRow({ sphereSnapshot: "ideeller", betragCents: 30000n }),
      makeRow({ sphereSnapshot: "zweckbetrieb", betragCents: 20000n }),
    ];
    const result = computeEurYear(2026, einnahmen, []);
    expect(result.bySphere.ideeller.totals.einnahmenCents).toBe(80000n);
    expect(result.bySphere.zweckbetrieb.totals.einnahmenCents).toBe(20000n);
    expect(result.bySphere.vermoegen.totals.einnahmenCents).toBe(0n);
    expect(result.bySphere.wirtschaftlich.totals.einnahmenCents).toBe(0n);
  });

  it("sums expenses by sphere", () => {
    const ausgaben: EurRow[] = [
      makeRow({ sphereSnapshot: "zweckbetrieb", betragCents: 15000n }),
      makeRow({ sphereSnapshot: "wirtschaftlich", betragCents: 8000n }),
    ];
    const result = computeEurYear(2026, [], ausgaben);
    expect(result.bySphere.zweckbetrieb.totals.ausgabenCents).toBe(15000n);
    expect(result.bySphere.wirtschaftlich.totals.ausgabenCents).toBe(8000n);
  });

  it("computes Überschuss = Einnahmen - Ausgaben per sphere", () => {
    const einnahmen = [
      makeRow({ sphereSnapshot: "ideeller", betragCents: 100000n }),
    ];
    const ausgaben = [
      makeRow({ sphereSnapshot: "ideeller", betragCents: 40000n }),
    ];
    const result = computeEurYear(2026, einnahmen, ausgaben);
    expect(result.bySphere.ideeller.totals.ueberschussCents).toBe(60000n);
  });

  it("Überschuss is negative when expenses exceed income", () => {
    const einnahmen = [
      makeRow({ sphereSnapshot: "wirtschaftlich", betragCents: 5000n }),
    ];
    const ausgaben = [
      makeRow({ sphereSnapshot: "wirtschaftlich", betragCents: 9000n }),
    ];
    const result = computeEurYear(2026, einnahmen, ausgaben);
    expect(result.bySphere.wirtschaftlich.totals.ueberschussCents).toBe(-4000n);
  });

  it("computes total Einnahmen across all spheres", () => {
    const einnahmen: EurRow[] = [
      makeRow({ sphereSnapshot: "ideeller", betragCents: 50000n }),
      makeRow({ sphereSnapshot: "zweckbetrieb", betragCents: 30000n }),
      makeRow({ sphereSnapshot: "vermoegen", betragCents: 10000n }),
      makeRow({ sphereSnapshot: "wirtschaftlich", betragCents: 20000n }),
    ];
    const result = computeEurYear(2026, einnahmen, []);
    expect(result.totalEinnahmenCents).toBe(110000n);
  });

  it("computes total Überschuss across all spheres", () => {
    const einnahmen = [
      makeRow({ betragCents: 100000n, sphereSnapshot: "ideeller" }),
    ];
    const ausgaben = [
      makeRow({ betragCents: 60000n, sphereSnapshot: "ideeller" }),
    ];
    const result = computeEurYear(2026, einnahmen, ausgaben);
    expect(result.totalUeberschussCents).toBe(40000n);
  });

  it("empty year returns all zeroes", () => {
    const result = computeEurYear(2026, [], []);
    expect(result.totalEinnahmenCents).toBe(0n);
    expect(result.totalAusgabenCents).toBe(0n);
    expect(result.totalUeberschussCents).toBe(0n);
    for (const sphere of [
      "ideeller",
      "vermoegen",
      "zweckbetrieb",
      "wirtschaftlich",
    ] as const) {
      expect(result.bySphere[sphere].totals.einnahmenCents).toBe(0n);
    }
  });

  it("row counts per sphere are correct", () => {
    const einnahmen: EurRow[] = [
      makeRow({ sphereSnapshot: "ideeller" }),
      makeRow({ sphereSnapshot: "ideeller" }),
      makeRow({ sphereSnapshot: "zweckbetrieb" }),
    ];
    const result = computeEurYear(2026, einnahmen, []);
    expect(result.bySphere.ideeller.einnahmen).toHaveLength(2);
    expect(result.bySphere.zweckbetrieb.einnahmen).toHaveLength(1);
    expect(result.bySphere.vermoegen.einnahmen).toHaveLength(0);
  });

  it("stores year on result", () => {
    const result = computeEurYear(2025, [], []);
    expect(result.year).toBe(2025);
  });
});

// ── aggregateByEurZeile ───────────────────────────────────────────────────────

describe("aggregateByEurZeile — ELSTER line grouping", () => {
  it("groups rows by eur_zeile and sums betrag", () => {
    const rows: EurRow[] = [
      makeRow({ eurZeile: 17, betragCents: 10000n }),
      makeRow({ eurZeile: 17, betragCents: 5000n }),
      makeRow({ eurZeile: 22, betragCents: 8000n }),
    ];
    const result = aggregateByEurZeile(rows);
    expect(result).toHaveLength(2);
    const z17 = result.find((r) => r.zeile === 17);
    expect(z17?.betragCents).toBe(15000n);
    const z22 = result.find((r) => r.zeile === 22);
    expect(z22?.betragCents).toBe(8000n);
  });

  it("puts null eur_zeile rows under zeile=0", () => {
    const rows = [makeRow({ eurZeile: null, betragCents: 3000n })];
    const result = aggregateByEurZeile(rows);
    expect(result[0]?.zeile).toBe(0);
    expect(result[0]?.betragCents).toBe(3000n);
  });

  it("returns sorted by zeile ascending", () => {
    const rows: EurRow[] = [
      makeRow({ eurZeile: 30 }),
      makeRow({ eurZeile: 5 }),
      makeRow({ eurZeile: 17 }),
    ];
    const result = aggregateByEurZeile(rows);
    expect(result.map((r) => r.zeile)).toEqual([5, 17, 30]);
  });

  it("returns empty array for empty input", () => {
    expect(aggregateByEurZeile([])).toEqual([]);
  });
});

// ── aggregateByAnlageGemZeile ─────────────────────────────────────────────────

describe("aggregateByAnlageGemZeile — Anlage Gem grouping", () => {
  it("groups by anlage_gem_zeile and sums betrag", () => {
    const rows: EurRow[] = [
      makeRow({ anlageGemZeile: 10, betragCents: 20000n }),
      makeRow({ anlageGemZeile: 10, betragCents: 15000n }),
      makeRow({ anlageGemZeile: 20, betragCents: 5000n }),
    ];
    const result = aggregateByAnlageGemZeile(rows);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.zeile === 10)?.betragCents).toBe(35000n);
  });

  it("skips rows with null anlage_gem_zeile", () => {
    const rows = [
      makeRow({ anlageGemZeile: null }),
      makeRow({ anlageGemZeile: 5, betragCents: 9000n }),
    ];
    const result = aggregateByAnlageGemZeile(rows);
    expect(result).toHaveLength(1);
    expect(result[0]?.zeile).toBe(5);
  });

  it("returns empty array when all zeilen are null", () => {
    const rows = [makeRow({ anlageGemZeile: null })];
    expect(aggregateByAnlageGemZeile(rows)).toEqual([]);
  });
});

// ── formatEurCents ────────────────────────────────────────────────────────────
// Note: toLocaleString('de-DE') output varies across Node/ICU versions.
// Newer versions use a narrow-no-break-space before the euro sign.
// Tests use toContain() to be version-agnostic.

describe("formatEurCents — German locale formatting", () => {
  it("formats 10000 cents: contains '100,00' and the euro sign", () => {
    const result = formatEurCents(10000n);
    expect(result).toContain("100,00");
    expect(result).toContain("€"); // euro sign
  });

  it("formats 123456 cents: contains '1.234,56' and the euro sign", () => {
    const result = formatEurCents(123456n);
    expect(result).toContain("1.234,56");
    expect(result).toContain("€");
  });

  it("formats 0 cents: contains '0,00' and the euro sign", () => {
    const result = formatEurCents(0n);
    expect(result).toContain("0,00");
    expect(result).toContain("€");
  });

  it("accepts number input: contains '50,50' and the euro sign", () => {
    const result = formatEurCents(5050);
    expect(result).toContain("50,50");
    expect(result).toContain("€");
  });

  it("formats negative amounts: contains numeric part and sign indicator", () => {
    const result = formatEurCents(-500n);
    expect(result).toContain("5,00");
    expect(result).toContain("€");
    expect(result).toMatch(/[-−(]/); // minus, unicode minus, or accounting paren
  });
});
