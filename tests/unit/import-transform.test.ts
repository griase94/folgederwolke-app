/**
 * @phase-6
 *
 * Unit tests for the legacy-sheet transform layer (src/lib/server/import/transform.ts).
 *
 * Covered invariants:
 *   - ADR-0001: gebucht_am is derived from the legacy timestamp (Abfluss / Rechnungsdatum),
 *     NOT the import timestamp.
 *   - ADR-0010: business_id is copied verbatim from the legacy sheet; rows without a valid
 *     business_id are skipped with an error entry.
 *   - Sphäre fallback: when no kategorie match exists the sphere cell is parsed.
 *   - bezahlt_von classification: "Verein" → verein; member name → member; other → extern.
 */

import { describe, it, expect } from "vitest";
import {
  transformLegacySheet,
  findMemberByName,
  type TransformContext,
  type MemberLookup,
  type KategorieLookup,
} from "$lib/server/import/transform.js";
import type {
  LegacySheet,
  LegacyTab,
} from "$lib/server/import/sheet-reader.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

// Per-kind "Unkategorisiert (Import)" sentinel ids — unmatched rows resolve to
// these (never null) per spec §4.6 / Task 8.
const SENTINEL_EXPENSE = "11111111-1111-1111-1111-111111111111";
const SENTINEL_INCOME = "22222222-2222-2222-2222-222222222222";

const EMPTY_CTX: TransformContext = {
  members: [],
  kategorien: [],
  projects: [],
  sourceTag: "test_import_2026",
  sentinelExpenseKategorieId: SENTINEL_EXPENSE,
  sentinelIncomeKategorieId: SENTINEL_INCOME,
};

function makeCtx(overrides: Partial<TransformContext> = {}): TransformContext {
  return { ...EMPTY_CTX, ...overrides };
}

/**
 * Build a minimal LegacySheet with an Ausgaben tab for the given rows.
 * The header row mirrors the canonical legacy Ausgaben layout used in transform.ts.
 */
function makeAusgabenSheet(rows: string[][]): LegacySheet {
  const headers = [
    "Nr", // col 0 → businessId
    "Abfluss-Datum", // col 1 → abfluss
    "Rechnungsdatum", // col 2 → rechnungsdatum
    "Bezeichnung", // col 3
    "Kategorie", // col 4
    "Sphäre", // col 5
    "Projekt", // col 6
    "Betrag", // col 7
    "Bezahlt von", // col 8
    "Bezahlt mit", // col 9
    "Erstattet am", // col 10
    "Beleg", // col 11
    "Ref", // col 12
    "Kommentar", // col 13
  ];
  const tab: LegacyTab = { name: "Ausgaben", headers, rows };
  return {
    tabs: { Ausgaben: tab },
    sourceHash: "deadbeef",
    source: "csv_upload",
  };
}

function makeEinnahmenSheet(rows: string[][]): LegacySheet {
  const headers = [
    "Nr",
    "Eingangs-Datum",
    "Rechnungsdatum",
    "Bezeichnung",
    "Kategorie",
    "Sphäre",
    "Projekt",
    "Betrag",
    "Zahlungsart",
    "Rechnung",
    "Kommentar",
  ];
  const tab: LegacyTab = { name: "Einnahmen", headers, rows };
  return {
    tabs: { Einnahmen: tab },
    sourceHash: "deadbeef",
    source: "csv_upload",
  };
}

// ---------------------------------------------------------------------------
// ADR-0001 + ADR-0010: gebucht_am and business_id preservation (Ausgaben)
// ---------------------------------------------------------------------------

describe("transformLegacySheet — Ausgaben (ADR-0001 + ADR-0010)", () => {
  it("copies business_id verbatim from the Nr column", () => {
    const sheet = makeAusgabenSheet([
      [
        "A-2024-042",
        "15.03.2024",
        "",
        "Bürobedarf",
        "",
        "",
        "",
        "123,45",
        "Verein",
        "",
        "",
        "",
        "",
        "",
      ],
    ]);
    const result = transformLegacySheet(sheet, makeCtx());
    expect(result.expenses).toHaveLength(1);
    expect(result.expenses[0]!.businessId).toBe("A-2024-042");
  });

  it("derives gebucht_am from the Abfluss-Datum column (ADR-0001)", () => {
    const sheet = makeAusgabenSheet([
      [
        "A-2024-001",
        "15.03.2024",
        "01.01.2024",
        "Miete",
        "",
        "",
        "",
        "500,00",
        "Verein",
        "",
        "",
        "",
        "",
        "",
      ],
    ]);
    const result = transformLegacySheet(sheet, makeCtx());
    expect(result.expenses).toHaveLength(1);
    // gebucht_am must be the Abfluss-Datum (15 March 2024), NOT import time and NOT Rechnungsdatum
    const gebuchtAm = result.expenses[0]!.gebuchtAm;
    expect(gebuchtAm.getFullYear()).toBe(2024);
    expect(gebuchtAm.getMonth()).toBe(2); // March = index 2
    expect(gebuchtAm.getDate()).toBe(15);
  });

  it("falls back to Rechnungsdatum when Abfluss-Datum is absent (ADR-0001)", () => {
    const sheet = makeAusgabenSheet([
      [
        "A-2024-002",
        "",
        "22.06.2024",
        "Druckerpatrone",
        "",
        "",
        "",
        "29,99",
        "Verein",
        "",
        "",
        "",
        "",
        "",
      ],
    ]);
    const result = transformLegacySheet(sheet, makeCtx());
    expect(result.expenses).toHaveLength(1);
    const gebuchtAm = result.expenses[0]!.gebuchtAm;
    expect(gebuchtAm.getFullYear()).toBe(2024);
    expect(gebuchtAm.getMonth()).toBe(5); // June = index 5
    expect(gebuchtAm.getDate()).toBe(22);
  });

  it("skips rows with no business_id silently (no error pushed)", () => {
    const sheet = makeAusgabenSheet([
      [
        "",
        "15.03.2024",
        "",
        "Leerzeile",
        "",
        "",
        "",
        "10,00",
        "Verein",
        "",
        "",
        "",
        "",
        "",
      ],
    ]);
    const result = transformLegacySheet(sheet, makeCtx());
    expect(result.expenses).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("adds an error for malformed business_id (ADR-0010)", () => {
    const sheet = makeAusgabenSheet([
      [
        "UNGUELTIG",
        "01.04.2024",
        "",
        "Test",
        "",
        "",
        "",
        "10,00",
        "Verein",
        "",
        "",
        "",
        "",
        "",
      ],
    ]);
    const result = transformLegacySheet(sheet, makeCtx());
    expect(result.expenses).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toMatch(/business_id/);
  });

  it("sets source to 'sheet_import' on every row", () => {
    const sheet = makeAusgabenSheet([
      [
        "A-2024-010",
        "10.05.2024",
        "",
        "Diverses",
        "",
        "",
        "",
        "50,00",
        "Verein",
        "",
        "",
        "",
        "",
        "",
      ],
    ]);
    const result = transformLegacySheet(sheet, makeCtx());
    expect(result.expenses[0]!.source).toBe("sheet_import");
  });

  it("includes sourceRef with tab + row hint (ADR-0012)", () => {
    const sheet = makeAusgabenSheet([
      [
        "A-2024-011",
        "01.06.2024",
        "",
        "Strom",
        "",
        "",
        "",
        "300,00",
        "Verein",
        "",
        "",
        "",
        "",
        "",
      ],
    ]);
    const result = transformLegacySheet(sheet, makeCtx());
    expect(result.expenses[0]!.sourceRef).toContain("Ausgaben");
  });
});

// ---------------------------------------------------------------------------
// ADR-0001: Einnahmen timestamp derivation
// ---------------------------------------------------------------------------

describe("transformLegacySheet — Einnahmen (ADR-0001)", () => {
  it("derives gebucht_am from Eingangs-Datum (geldEingangDatum)", () => {
    const sheet = makeEinnahmenSheet([
      [
        "E-2023-005",
        "14.07.2023",
        "",
        "Mitgliedsbeitrag",
        "",
        "",
        "",
        "120,00",
        "",
        "",
        "",
      ],
    ]);
    const result = transformLegacySheet(sheet, makeCtx());
    expect(result.income).toHaveLength(1);
    const gebuchtAm = result.income[0]!.gebuchtAm;
    expect(gebuchtAm.getFullYear()).toBe(2023);
    expect(gebuchtAm.getMonth()).toBe(6); // July = index 6
    expect(gebuchtAm.getDate()).toBe(14);
  });

  it("preserves business_id verbatim (ADR-0010)", () => {
    const sheet = makeEinnahmenSheet([
      [
        "E-2023-007",
        "01.01.2023",
        "",
        "Sonstiges",
        "",
        "",
        "",
        "50,00",
        "",
        "",
        "",
      ],
    ]);
    const result = transformLegacySheet(sheet, makeCtx());
    expect(result.income[0]!.businessId).toBe("E-2023-007");
  });
});

// ---------------------------------------------------------------------------
// bezahlt_von discriminator
// ---------------------------------------------------------------------------

describe("classifyBezahltVon via transformLegacySheet", () => {
  const members: MemberLookup[] = [
    { id: "mem-1", vorname: "Anna", nachname: "Müller" },
  ];

  it("classifies 'Verein' as kind=verein", () => {
    const sheet = makeAusgabenSheet([
      [
        "A-2024-020",
        "01.03.2024",
        "",
        "Miete",
        "",
        "",
        "",
        "400,00",
        "Verein",
        "",
        "",
        "",
        "",
        "",
      ],
    ]);
    const result = transformLegacySheet(sheet, makeCtx({ members }));
    expect(result.expenses[0]!.bezahltVonKind).toBe("verein");
    expect(result.expenses[0]!.bezahltVonMemberId).toBeNull();
  });

  it("classifies a known member name as kind=member and sets memberId", () => {
    const sheet = makeAusgabenSheet([
      [
        "A-2024-021",
        "05.03.2024",
        "",
        "Konferenz",
        "",
        "",
        "",
        "150,00",
        "Anna Müller",
        "",
        "",
        "",
        "",
        "",
      ],
    ]);
    const result = transformLegacySheet(sheet, makeCtx({ members }));
    expect(result.expenses[0]!.bezahltVonKind).toBe("member");
    expect(result.expenses[0]!.bezahltVonMemberId).toBe("mem-1");
  });

  it("classifies unknown text as kind=extern", () => {
    const sheet = makeAusgabenSheet([
      [
        "A-2024-022",
        "07.03.2024",
        "",
        "Extern-Test",
        "",
        "",
        "",
        "80,00",
        "Max Extern GmbH",
        "",
        "",
        "",
        "",
        "",
      ],
    ]);
    const result = transformLegacySheet(sheet, makeCtx({ members }));
    expect(result.expenses[0]!.bezahltVonKind).toBe("extern");
    expect(result.expenses[0]!.externName).toBe("Max Extern GmbH");
  });
});

// ---------------------------------------------------------------------------
// findMemberByName strategy coverage
// ---------------------------------------------------------------------------

describe("findMemberByName", () => {
  const members: MemberLookup[] = [
    { id: "a", vorname: "Hans", nachname: "Meier" },
    { id: "b", vorname: "Lena", nachname: "Schmidt" },
  ];

  it("matches full 'Vorname Nachname'", () => {
    expect(findMemberByName("Hans Meier", members)?.id).toBe("a");
  });

  it("matches nachname only when unique", () => {
    expect(findMemberByName("Schmidt", members)?.id).toBe("b");
  });

  it("matches vorname only when unique", () => {
    expect(findMemberByName("Lena", members)?.id).toBe("b");
  });

  it("returns null for non-matching text", () => {
    expect(findMemberByName("Unbekannt", members)).toBeNull();
  });

  it("returns null for null/empty input", () => {
    expect(findMemberByName(null, members)).toBeNull();
    expect(findMemberByName("", members)).toBeNull();
  });

  it("matches case-insensitively", () => {
    expect(findMemberByName("hans meier", members)?.id).toBe("a");
  });
});

// ---------------------------------------------------------------------------
// Kategorie + sphere resolution
// ---------------------------------------------------------------------------

describe("kategorie resolver — sphere fallback", () => {
  const kategorien: KategorieLookup[] = [
    {
      id: "k1",
      kind: "expense",
      name: "Bürobedarf",
      sphere: "ideeller",
    },
  ];

  it("resolves sphere from matching kategorie", () => {
    const sheet = makeAusgabenSheet([
      [
        "A-2024-030",
        "01.04.2024",
        "",
        "Papier",
        "Bürobedarf",
        "",
        "",
        "10,00",
        "Verein",
        "",
        "",
        "",
        "",
        "",
      ],
    ]);
    const result = transformLegacySheet(sheet, makeCtx({ kategorien }));
    expect(result.expenses[0]!.sphereSnapshot).toBe("ideeller");
    expect(result.expenses[0]!.kategorieId).toBe("k1");
  });

  it("falls back to parsing sphere cell when no kategorie matches", () => {
    const sheet = makeAusgabenSheet([
      [
        "A-2024-031",
        "02.04.2024",
        "",
        "Sonstiges",
        "Unbekannt",
        "zweckbetrieb",
        "",
        "25,00",
        "Verein",
        "",
        "",
        "",
        "",
        "",
      ],
    ]);
    const result = transformLegacySheet(sheet, makeCtx({ kategorien }));
    // Unmatched kategorie now resolves to the Import sentinel (never null) per
    // spec §4.6 / Task 8; the sphere is still parsed from the sheet cell.
    expect(result.expenses[0]!.kategorieId).toBe(SENTINEL_EXPENSE);
    expect(result.expenses[0]!.sphereSnapshot).toBe("zweckbetrieb");
  });

  it("defaults to ideeller when sphere cell is also unrecognised", () => {
    const sheet = makeAusgabenSheet([
      [
        "A-2024-032",
        "03.04.2024",
        "",
        "Sonstiges",
        "???",
        "???",
        "",
        "5,00",
        "Verein",
        "",
        "",
        "",
        "",
        "",
      ],
    ]);
    const result = transformLegacySheet(sheet, makeCtx({ kategorien }));
    expect(result.expenses[0]!.sphereSnapshot).toBe("ideeller");
  });
});

// ---------------------------------------------------------------------------
// yearsTouched aggregation
// ---------------------------------------------------------------------------

describe("yearsTouched", () => {
  it("collects unique years across all tabs", () => {
    const sheet = makeAusgabenSheet([
      [
        "A-2023-001",
        "10.06.2023",
        "",
        "Test A",
        "",
        "",
        "",
        "100,00",
        "Verein",
        "",
        "",
        "",
        "",
        "",
      ],
      [
        "A-2024-001",
        "10.06.2024",
        "",
        "Test B",
        "",
        "",
        "",
        "200,00",
        "Verein",
        "",
        "",
        "",
        "",
        "",
      ],
    ]);
    const result = transformLegacySheet(sheet, makeCtx());
    expect(result.yearsTouched).toContain(2023);
    expect(result.yearsTouched).toContain(2024);
  });
});
