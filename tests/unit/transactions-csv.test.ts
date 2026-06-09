/**
 * Unit tests for csv-util.ts and transactions-csv.ts (Phase 8 Task 1).
 *
 * Pure, no DB. Runs in the fast lane (vitest).
 */

import { describe, it, expect } from "vitest";
import { csvCell, formatCents, BOM } from "$lib/server/export/csv-util.js";
import { buildTransactionsCsv } from "$lib/server/export/transactions-csv.js";
import type {
  AusgabenRow,
  EinnahmenRow,
  SpendenRow,
} from "$lib/server/domain/transactions.js";

// ---------------------------------------------------------------------------
// csvCell / formatCents characterization
// ---------------------------------------------------------------------------

describe("csvCell — characterization / byte-parity with oracle", () => {
  it("plain string — no quoting needed", () => {
    expect(csvCell("Hallo")).toBe("Hallo");
  });

  it("string with semicolon — wrapped in double-quotes", () => {
    expect(csvCell("Müller; Co")).toBe('"Müller; Co"');
  });

  it("string with double-quote — quoted and internal quote doubled", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("string with CR — quoted", () => {
    expect(csvCell("line1\rline2")).toBe('"line1\rline2"');
  });

  it("string with LF — quoted", () => {
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("null → empty string", () => {
    expect(csvCell(null)).toBe("");
  });

  it("undefined → empty string", () => {
    expect(csvCell(undefined)).toBe("");
  });

  it("number — stringified, no quoting (no special chars)", () => {
    expect(csvCell(42)).toBe("42");
  });

  it("zero — stringified", () => {
    expect(csvCell(0)).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// formatCents
// ---------------------------------------------------------------------------

describe("formatCents", () => {
  it("123456 → 1234,56", () => {
    expect(formatCents(123456)).toBe("1234,56");
  });

  it("5 → 0,05", () => {
    expect(formatCents(5)).toBe("0,05");
  });

  it("100 → 1,00", () => {
    expect(formatCents(100)).toBe("1,00");
  });

  it("no thousands separator", () => {
    // 1.234,56 would be the locale format; oracle uses plain 1234,56
    expect(formatCents(123456)).not.toContain(".");
    expect(formatCents(1234567)).toBe("12345,67");
  });
});

// ---------------------------------------------------------------------------
// BOM
// ---------------------------------------------------------------------------

describe("BOM", () => {
  it("is the UTF-8 BOM character (U+FEFF)", () => {
    expect(BOM).toBe("﻿");
    expect(BOM.charCodeAt(0)).toBe(0xfeff);
  });
});

// ---------------------------------------------------------------------------
// Injection guard
// ---------------------------------------------------------------------------

describe("csvCell — formula-injection guard", () => {
  it("value starting with '=' gets a leading apostrophe", () => {
    const result = csvCell("=1+1");
    expect(result).toMatch(/^'/);
    expect(result).toBe("'=1+1");
  });

  it("value starting with '@' gets a leading apostrophe", () => {
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("value starting with '+' gets a leading apostrophe", () => {
    expect(csvCell("+test")).toBe("'+test");
  });

  it("value starting with '-' gets a leading apostrophe (text cell)", () => {
    // "-2" as a STRING triggers injection guard; raw number cells are
    // stringified first, so this tests the string path.
    expect(csvCell("-2")).toBe("'-2");
  });

  it("value starting with TAB (0x09) gets a leading apostrophe", () => {
    expect(csvCell("\thello")).toBe("'\thello");
  });

  it("value starting with CR (0x0D) as injection trigger: apostrophe prepended then cell quoted", () => {
    // CR at position 0 triggers BOTH injection guard AND quoting
    // (CR is in the quote-trigger set). Guard fires first → apostrophe prepended,
    // then the full string (apostrophe + CR + rest) contains \r → must be quoted.
    // Result: "'\rhello" — apostrophe is present but INSIDE the outer double-quotes.
    const result = csvCell("\rhello");
    // Cell is wrapped in double-quotes (because \r triggers quoting)
    expect(result.startsWith('"')).toBe(true);
    // Apostrophe is present inside the quotes (injection guard fired)
    expect(result).toContain("'");
    expect(result).toBe('"\'\\rhello"'.replace("\\r", "\r"));
  });

  it("injection apostrophe is prepended BEFORE quoting when value also contains ;", () => {
    // '=foo;bar' → raw string '=foo;bar' triggers injection (starts '=')
    // After prepending apostrophe → ''=foo;bar' which contains ';' → must be quoted
    const result = csvCell("=foo;bar");
    // The apostrophe must come first inside the outer double-quotes
    expect(result).toBe(`"'=foo;bar"`);
  });
});

// ---------------------------------------------------------------------------
// Unicode round-trip
// ---------------------------------------------------------------------------

describe("csvCell — unicode round-trip", () => {
  it("non-ASCII chars preserved with no quoting when no special chars", () => {
    expect(csvCell("Müller")).toBe("Müller");
    expect(csvCell("Ä€🎉")).toBe("Ä€🎉");
  });

  it('Müller; "Sonder"\\nÄ€🎉 — semicolon forces quoting, internal quote doubled', () => {
    const input = 'Müller; "Sonder"\nÄ€🎉';
    const result = csvCell(input);
    // Must be quoted (has ; and \n)
    expect(result.startsWith('"')).toBe(true);
    expect(result.endsWith('"')).toBe(true);
    // Internal quote doubled
    expect(result).toContain('""Sonder""');
    // Non-ASCII preserved
    expect(result).toContain("Müller");
    expect(result).toContain("Ä€🎉");
  });
});

// ---------------------------------------------------------------------------
// buildTransactionsCsv — header
// ---------------------------------------------------------------------------

const EXPECTED_HEADER_11 =
  "Datum;Buchung-Nr;Bezeichnung;Art;Sphäre (Snapshot);Sphäre (Effektiv);Kategorie;Betrag (EUR);Betrag (Cent);Währung;Festgeschrieben am";

describe("buildTransactionsCsv — header", () => {
  it("Ausgaben: first data line (after BOM+header) has exactly 11 columns", () => {
    const csv = buildTransactionsCsv([], "ausgaben");
    // Strip BOM, split on CRLF, first line is the header
    const withoutBom = csv.startsWith(BOM) ? csv.slice(BOM.length) : csv;
    const lines = withoutBom.split("\r\n").filter((l) => l.length > 0);
    expect(lines[0]).toBe(EXPECTED_HEADER_11);
    expect(lines[0]!.split(";")).toHaveLength(11);
  });

  it("Einnahmen: header is the standard 11-column header", () => {
    const csv = buildTransactionsCsv([], "einnahmen");
    const withoutBom = csv.startsWith(BOM) ? csv.slice(BOM.length) : csv;
    const lines = withoutBom.split("\r\n").filter((l) => l.length > 0);
    expect(lines[0]).toBe(EXPECTED_HEADER_11);
  });

  it("Spenden: header has 12 columns (11 + Bescheinigung)", () => {
    const csv = buildTransactionsCsv([], "spenden");
    const withoutBom = csv.startsWith(BOM) ? csv.slice(BOM.length) : csv;
    const lines = withoutBom.split("\r\n").filter((l) => l.length > 0);
    expect(lines[0]).toBe(EXPECTED_HEADER_11 + ";Bescheinigung");
    expect(lines[0]!.split(";")).toHaveLength(12);
  });
});

// ---------------------------------------------------------------------------
// buildTransactionsCsv — BOM
// ---------------------------------------------------------------------------

describe("buildTransactionsCsv — BOM", () => {
  it("output starts with UTF-8 BOM", () => {
    const csv = buildTransactionsCsv([], "ausgaben");
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });
});

// ---------------------------------------------------------------------------
// buildTransactionsCsv — delimiter and line terminator
// ---------------------------------------------------------------------------

describe("buildTransactionsCsv — delimiter and line terminator", () => {
  it("cells are semicolon-delimited", () => {
    const csv = buildTransactionsCsv([], "ausgaben");
    // Header line has exactly 10 semicolons (11 columns)
    const withoutBom = csv.slice(BOM.length);
    const headerLine = withoutBom.split("\r\n")[0]!;
    expect(headerLine.split(";")).toHaveLength(11);
  });

  it("lines are terminated with CRLF (\\r\\n)", () => {
    const csv = buildTransactionsCsv([], "ausgaben");
    // Must contain CRLF
    expect(csv).toContain("\r\n");
    // Must NOT use bare LF as the primary line terminator
    // (the only \n in the file should be preceded by \r)
    const withoutCRLF = csv.replace(/\r\n/g, "");
    expect(withoutCRLF).not.toContain("\n");
  });
});

// ---------------------------------------------------------------------------
// buildTransactionsCsv — Ausgaben row data (characterization / byte-parity)
// ---------------------------------------------------------------------------

const baseAusgabenRow: AusgabenRow = {
  id: "uuid-1",
  kind: "expense",
  businessId: "AUS-2024-001",
  bezeichnung: "Bürobedarf",
  betragCents: 4250,
  currency: "EUR",
  gebuchtAm: "2024-03-15T10:00:00.000Z",
  sphereSnapshot: "ideeller",
  sphereOverride: null,
  sphereEffective: "ideeller",
  kategorieNameSnapshot: "Büro",
  yearOfBuchung: 2024,
  festgeschriebenAt: "2024-12-31T23:59:59.000Z",
  status: "erstattet",
  bezahltVonKind: "member",
  bezahltVonDisplay: "Max Mustermann",
  erstattetAm: null,
  belegFileId: null,
  approvedAt: null,
};

describe("buildTransactionsCsv — Ausgaben row (characterization)", () => {
  it("produces the correct row columns in order", () => {
    const csv = buildTransactionsCsv([baseAusgabenRow], "ausgaben");
    const withoutBom = csv.slice(BOM.length);
    const lines = withoutBom.split("\r\n").filter((l) => l.length > 0);
    // lines[0] = header, lines[1] = data row
    expect(lines).toHaveLength(2);
    const cells = lines[1]!.split(";");
    expect(cells).toHaveLength(11);
    // Datum — raw gebuchtAm
    expect(cells[0]).toBe("2024-03-15T10:00:00.000Z");
    // Buchung-Nr
    expect(cells[1]).toBe("AUS-2024-001");
    // Bezeichnung
    expect(cells[2]).toBe("Bürobedarf");
    // Art — expense → Ausgabe
    expect(cells[3]).toBe("Ausgabe");
    // Sphäre (Snapshot)
    expect(cells[4]).toBe("Ideeller Bereich");
    // Sphäre (Effektiv) — for AusgabenRow, falls back to sphereSnapshot when no override
    expect(cells[5]).toBe("Ideeller Bereich");
    // Kategorie
    expect(cells[6]).toBe("Büro");
    // Betrag (EUR) — 4250 cents = 42,50
    expect(cells[7]).toBe("42,50");
    // Betrag (Cent) — raw integer
    expect(cells[8]).toBe("4250");
    // Währung
    expect(cells[9]).toBe("EUR");
    // Festgeschrieben am
    expect(cells[10]).toBe("2024-12-31T23:59:59.000Z");
  });
});

// ---------------------------------------------------------------------------
// buildTransactionsCsv — Einnahmen row
// ---------------------------------------------------------------------------

const baseEinnahmenRow: EinnahmenRow = {
  id: "uuid-2",
  kind: "income",
  businessId: "EIN-2024-042",
  bezeichnung: "Mitgliedsbeitrag",
  betragCents: 12000,
  currency: "EUR",
  gebuchtAm: "2024-06-01T00:00:00.000Z",
  sphereSnapshot: "ideeller",
  kategorieNameSnapshot: "Mitgliedsbeiträge",
  yearOfBuchung: 2024,
  festgeschriebenAt: null,
  rechnungBusinessId: null,
};

describe("buildTransactionsCsv — Einnahmen row", () => {
  it("produces correct Einnahmen row", () => {
    const csv = buildTransactionsCsv([baseEinnahmenRow], "einnahmen");
    const withoutBom = csv.slice(BOM.length);
    const lines = withoutBom.split("\r\n").filter((l) => l.length > 0);
    const cells = lines[1]!.split(";");
    expect(cells[3]).toBe("Einnahme");
    expect(cells[7]).toBe("120,00");
    expect(cells[8]).toBe("12000");
    // festgeschriebenAt null → empty
    expect(cells[10]).toBe("");
  });
});

// ---------------------------------------------------------------------------
// buildTransactionsCsv — Spenden row (12 columns, Bescheinigung)
// ---------------------------------------------------------------------------

const baseSpendenRow: SpendenRow = {
  id: "uuid-3",
  kind: "donation",
  businessId: "SPE-2024-007",
  bezeichnung: "Spende von Anna Spender",
  betragCents: 5000,
  currency: "EUR",
  gebuchtAm: "2024-09-20T08:00:00.000Z",
  sphereSnapshot: "ideeller",
  kategorieNameSnapshot: "Geldspende zweckfrei",
  yearOfBuchung: 2024,
  festgeschriebenAt: null,
  spenderName: "Anna Spender",
  spendeKind: "geldspende",
  zweckbindungKind: "zweckfrei",
  bescheinigungNr: "BESCH-2024-007",
};

describe("buildTransactionsCsv — Spenden row", () => {
  it("produces 12 columns with Bescheinigung (receipt number)", () => {
    const csv = buildTransactionsCsv([baseSpendenRow], "spenden");
    const withoutBom = csv.slice(BOM.length);
    const lines = withoutBom.split("\r\n").filter((l) => l.length > 0);
    const cells = lines[1]!.split(";");
    expect(cells).toHaveLength(12);
    expect(cells[3]).toBe("Spende");
    expect(cells[11]).toBe("BESCH-2024-007");
  });

  it("Bescheinigung is 'ausstehend' when bescheinigungNr is null", () => {
    const rowNoReceipt: SpendenRow = {
      ...baseSpendenRow,
      bescheinigungNr: null,
    };
    const csv = buildTransactionsCsv([rowNoReceipt], "spenden");
    const withoutBom = csv.slice(BOM.length);
    const lines = withoutBom.split("\r\n").filter((l) => l.length > 0);
    const cells = lines[1]!.split(";");
    expect(cells[11]).toBe("ausstehend");
  });
});

// ---------------------------------------------------------------------------
// buildTransactionsCsv — Betrag (unsigned amounts)
// ---------------------------------------------------------------------------

describe("buildTransactionsCsv — Betrag columns are unsigned", () => {
  it("expense betragCents is unsigned (direction is in Art column)", () => {
    const csv = buildTransactionsCsv([baseAusgabenRow], "ausgaben");
    const withoutBom = csv.slice(BOM.length);
    const dataLine = withoutBom.split("\r\n")[1]!;
    const cells = dataLine.split(";");
    // Neither EUR nor Cent column should be negative
    expect(cells[7]).not.toMatch(/^-/);
    expect(cells[8]).not.toMatch(/^-/);
  });
});

// ---------------------------------------------------------------------------
// buildTransactionsCsv — trailing CRLF
// ---------------------------------------------------------------------------

describe("buildTransactionsCsv — trailing CRLF", () => {
  it("output ends with \\r\\n (oracle appends trailing newline)", () => {
    const csv = buildTransactionsCsv([], "ausgaben");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("output with one data row also ends with \\r\\n", () => {
    const csv = buildTransactionsCsv([baseAusgabenRow], "ausgaben");
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Golden full-line byte-parity — one exact-literal assertion per tab. Catches
// column reorder / label / separator / BOM / CRLF regressions in one shot.
// The literals are derived from the oracle's logic (BOM + header + CRLF + row).
// ---------------------------------------------------------------------------

describe("buildTransactionsCsv — golden full-line byte-parity", () => {
  it("Ausgaben: exact bytes for baseAusgabenRow", () => {
    const csv = buildTransactionsCsv([baseAusgabenRow], "ausgaben");
    expect(csv).toBe(
      BOM +
        "Datum;Buchung-Nr;Bezeichnung;Art;Sphäre (Snapshot);Sphäre (Effektiv);Kategorie;Betrag (EUR);Betrag (Cent);Währung;Festgeschrieben am" +
        "\r\n" +
        "2024-03-15T10:00:00.000Z;AUS-2024-001;Bürobedarf;Ausgabe;Ideeller Bereich;Ideeller Bereich;Büro;42,50;4250;EUR;2024-12-31T23:59:59.000Z" +
        "\r\n",
    );
  });

  it("Einnahmen: exact bytes for baseEinnahmenRow (null Festschreibung → empty cell)", () => {
    const csv = buildTransactionsCsv([baseEinnahmenRow], "einnahmen");
    expect(csv).toBe(
      BOM +
        "Datum;Buchung-Nr;Bezeichnung;Art;Sphäre (Snapshot);Sphäre (Effektiv);Kategorie;Betrag (EUR);Betrag (Cent);Währung;Festgeschrieben am" +
        "\r\n" +
        "2024-06-01T00:00:00.000Z;EIN-2024-042;Mitgliedsbeitrag;Einnahme;Ideeller Bereich;Ideeller Bereich;Mitgliedsbeiträge;120,00;12000;EUR;" +
        "\r\n",
    );
  });

  it("Spenden: exact bytes for baseSpendenRow (12th Bescheinigung column)", () => {
    const csv = buildTransactionsCsv([baseSpendenRow], "spenden");
    expect(csv).toBe(
      BOM +
        "Datum;Buchung-Nr;Bezeichnung;Art;Sphäre (Snapshot);Sphäre (Effektiv);Kategorie;Betrag (EUR);Betrag (Cent);Währung;Festgeschrieben am;Bescheinigung" +
        "\r\n" +
        "2024-09-20T08:00:00.000Z;SPE-2024-007;Spende von Anna Spender;Spende;Ideeller Bereich;Ideeller Bereich;Geldspende zweckfrei;50,00;5000;EUR;;BESCH-2024-007" +
        "\r\n",
    );
  });
});

// ---------------------------------------------------------------------------
// Injection-hardening characterization (PINS the new guarded behavior).
//
// This documents an INTENTIONAL divergence from the oracle's old inline
// csvCell, which had NO injection guard. A Bezeichnung that begins with `=`
// (or +, -, @, TAB, CR) is now apostrophe-prefixed AND quoted (the leading `'`
// makes the cell start with `'` which is fine, but the original `=…` payload
// here also has no quote-triggers, so the only change is the apostrophe — it
// is NOT quoted). Verified: a clean formula like `=SUM(A1)` → `'=SUM(A1)`.
// ---------------------------------------------------------------------------

describe("buildTransactionsCsv — CSV-injection hardening (intentional)", () => {
  it("Bezeichnung starting with '=' is neutralized with a leading apostrophe", () => {
    const malicious: AusgabenRow = {
      ...baseAusgabenRow,
      bezeichnung: "=SUM(A1)",
    };
    const csv = buildTransactionsCsv([malicious], "ausgaben");
    const withoutBom = csv.slice(BOM.length);
    const dataLine = withoutBom.split("\r\n")[1]!;
    const cells = dataLine.split(";");
    // `=SUM(A1)` has no quote-trigger chars, so the only mutation is the
    // prepended apostrophe — no surrounding double-quotes.
    expect(cells[2]).toBe("'=SUM(A1)");
  });

  it("formula payload that ALSO contains a delimiter is apostrophe-prefixed then quoted", () => {
    const malicious: AusgabenRow = {
      ...baseAusgabenRow,
      // `@cmd|'/calc'!A1;0` — starts with @ (injection) AND contains ; (quote).
      bezeichnung: "@cmd;0",
    };
    const csv = buildTransactionsCsv([malicious], "ausgaben");
    const withoutBom = csv.slice(BOM.length);
    const dataLine = withoutBom.split("\r\n")[1];
    // The apostrophe is inside the outer quotes; the embedded ; does NOT split
    // the cell (it's quoted), so the Bezeichnung survives as one field.
    expect(dataLine).toContain(`"'@cmd;0"`);
  });
});
