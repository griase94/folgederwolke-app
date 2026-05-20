/**
 * @phase-2
 *
 * C1 cycle 2 — C1-M3 — Steuerberater-Paket bundle includes Bescheinigung
 * PDFs, audit-log slice, and Mitgliedsbeitrags CSV (in addition to the
 * pre-existing EÜR PDF + Anlage Gem + Spendenliste + Beleg-Index + GoBD-Z3).
 *
 * Pure unit-level test against `buildJahresabschlussBundle` — no DB.
 */

import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  buildJahresabschlussBundle,
  generateAuditLogCsv,
  generateMemberBeitragsCsv,
  type BescheinigungAttachment,
  type AuditLogSliceRow,
  type MemberBeitragRow,
} from "$lib/server/export/bundle.js";
import type { EurYearResult, Sphere } from "$lib/server/domain/eur.js";

function emptyEur(year: number): EurYearResult {
  const spheres: Sphere[] = [
    "ideeller",
    "vermoegen",
    "zweckbetrieb",
    "wirtschaftlich",
  ];
  const bySphere = {} as EurYearResult["bySphere"];
  for (const s of spheres) {
    bySphere[s] = {
      sphere: s,
      einnahmen: [],
      ausgaben: [],
      totals: {
        einnahmenCents: 0n,
        ausgabenCents: 0n,
        ueberschussCents: 0n,
      },
    };
  }
  return {
    year,
    bySphere,
    totalEinnahmenCents: 0n,
    totalAusgabenCents: 0n,
    totalUeberschussCents: 0n,
  };
}

describe("buildJahresabschlussBundle — C1-M3 extras", () => {
  it("bundle includes 06_Bescheinigungen-{year}/ folder when PDFs supplied", async () => {
    const bescheinigungPdfs: BescheinigungAttachment[] = [
      {
        filename: "Zuwendungsbestaetigung_B-2025-001.pdf",
        bytes: new TextEncoder().encode("%PDF-fake-1"),
      },
      {
        filename: "Zuwendungsbestaetigung_B-2025-002.pdf",
        bytes: new TextEncoder().encode("%PDF-fake-2"),
      },
    ];
    const buf = await buildJahresabschlussBundle({
      year: 2025,
      eur: emptyEur(2025),
      eurPdfBytes: null,
      spenden: [],
      belege: [],
      vereinName: "Test e.V.",
      includeGobdZ3: false,
      bescheinigungPdfs,
    });
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files);
    expect(
      names.some((n) =>
        n.includes("06_Bescheinigungen-2025/Zuwendungsbestaetigung_B-2025-001.pdf"),
      ),
    ).toBe(true);
    expect(
      names.some((n) =>
        n.includes("06_Bescheinigungen-2025/Zuwendungsbestaetigung_B-2025-002.pdf"),
      ),
    ).toBe(true);
  });

  it("bundle includes 07_Audit-Log-{year}.csv when slice supplied", async () => {
    const slice: AuditLogSliceRow[] = [
      {
        occurredAt: "2025-03-01T10:00:00Z",
        actorKind: "user",
        actorDisplay: "Andy Griesbeck",
        action: "income.create",
        entityKind: "income",
        entityBusinessId: "E-2025-100",
        payload: '{"betragCents":10000}',
      },
    ];
    const buf = await buildJahresabschlussBundle({
      year: 2025,
      eur: emptyEur(2025),
      eurPdfBytes: null,
      spenden: [],
      belege: [],
      vereinName: "Test e.V.",
      includeGobdZ3: false,
      auditLogSlice: slice,
    });
    const zip = await JSZip.loadAsync(buf);
    const auditFile = zip.file("07_Audit-Log-2025.csv");
    expect(auditFile).toBeDefined();
    const csv = await auditFile!.async("string");
    expect(csv).toContain("income.create");
    expect(csv).toContain("E-2025-100");
  });

  it("bundle includes 08_Mitgliedsbeitraege-{year}.csv when beitrags supplied", async () => {
    const rows: MemberBeitragRow[] = [
      {
        memberName: "Max Mustermann",
        year: 2025,
        betragCents: 6969n,
        paidCents: 6969n,
        gezahltAm: "2025-05-15",
      },
    ];
    const buf = await buildJahresabschlussBundle({
      year: 2025,
      eur: emptyEur(2025),
      eurPdfBytes: null,
      spenden: [],
      belege: [],
      vereinName: "Test e.V.",
      includeGobdZ3: false,
      memberBeitrags: rows,
    });
    const zip = await JSZip.loadAsync(buf);
    const beitragsFile = zip.file("08_Mitgliedsbeitraege-2025.csv");
    expect(beitragsFile).toBeDefined();
    const csv = await beitragsFile!.async("string");
    expect(csv).toContain("Max Mustermann");
    expect(csv).toContain("69,69");
  });

  it("absent inputs → corresponding bundle entries not present (backwards compatible)", async () => {
    const buf = await buildJahresabschlussBundle({
      year: 2025,
      eur: emptyEur(2025),
      eurPdfBytes: null,
      spenden: [],
      belege: [],
      vereinName: "Test e.V.",
      includeGobdZ3: false,
    });
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files);
    expect(names.some((n) => n.startsWith("06_Bescheinigungen-"))).toBe(false);
    expect(names.includes("07_Audit-Log-2025.csv")).toBe(false);
    expect(names.includes("08_Mitgliedsbeitraege-2025.csv")).toBe(false);
  });
});

describe("CSV generators for the bundle slices", () => {
  it("generateAuditLogCsv emits UTF-8 BOM + semicolon-delimited header", () => {
    const csv = generateAuditLogCsv([
      {
        occurredAt: "2025-03-01T10:00:00Z",
        actorKind: "user",
        actorDisplay: "Andy",
        action: "income.create",
        entityKind: "income",
        entityBusinessId: "E-2025-100",
        payload: '{"k":"v"}',
      },
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toMatch(/Zeit;Akteur-Art;Akteur;Aktion/);
    expect(csv).toContain("income.create");
  });

  it("generateMemberBeitragsCsv emits formatted EUR + raw cents", () => {
    const csv = generateMemberBeitragsCsv([
      {
        memberName: "Max",
        year: 2025,
        betragCents: 6969n,
        paidCents: 5000n,
        gezahltAm: "2025-05-15",
      },
    ]);
    expect(csv).toMatch(/Mitglied;Jahr;Soll/);
    expect(csv).toContain("69,69");
    expect(csv).toContain("50,00");
  });
});
