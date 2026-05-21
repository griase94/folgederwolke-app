/**
 * Phase 10 — Rechnung v2 renderer fixture tests.
 *
 * Each test renders one fixture case end-to-end, asserts basic
 * properties of the PDF bytes, and writes the file to /tmp/ so Andy
 * can visually compare against the reference template.
 *
 * The reference PDFs are:
 *   - Downloads/Template.pdf
 *   - Downloads/_VA-2026-02-Beate-Uwe (1).pdf
 *
 * The committed visual baseline lives at
 *   tests/fixtures/expected/rechnung-v2-beate-uwe.pdf
 * so future renderer changes can be eyeballed via `diff -q` (the binary
 * differs run-to-run because of timestamps; a future visual-diff workflow
 * is out of scope here).
 */
import { describe, it, expect } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { PDFDocument } from "pdf-lib";
import {
  renderRechnungV2,
  countryLabelForAlpha2,
  formatDE,
  formatEur,
} from "$lib/server/pdf/templates/rechnung-v2/index.js";
import type { RechnungV2Input } from "$lib/server/pdf/templates/rechnung-v2/index.js";

const VEREIN_FIXTURE: RechnungV2Input["verein"] = {
  name: "Folge der Wolke e.V.",
  adresseSingleLine: "Westermühlstraße 6 - 80469 München",
  adresseLine1: "Westermühlstraße 6",
  adresseLine2: "80469 München",
  vereinsregister: "VR 211227",
  steuernummer: "143/215/10028",
  kontaktPerson: "Jonas Hackenberg",
  contactPhone: "+49 176 / 81566960",
  contactEmail: "booking@folgederwolke.de",
  bankname: "Deutsche Skatbank",
  iban: "DE25 8306 5408 0006 8944 53",
  bic: "GENO DEF1 SLR",
};

async function writeOut(name: string, bytes: Uint8Array): Promise<string> {
  const path = `/tmp/rechnung-test-${name}.pdf`;
  await writeFile(path, bytes);
  return path;
}

async function assertSensiblePdf(bytes: Uint8Array): Promise<PDFDocument> {
  expect(bytes.length).toBeGreaterThan(10_000);
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  return doc;
}

describe("Rechnung v2 — formatters", () => {
  it("formatEur returns German-locale currency", () => {
    expect(formatEur(167570)).toMatch(/1.675,70/);
  });
  it("formatDE flips ISO date to DE date", () => {
    expect(formatDE("2026-03-02")).toBe("02.03.2026");
  });
  it("countryLabelForAlpha2 maps known codes; returns code for unknown", () => {
    expect(countryLabelForAlpha2("DE")).toBe("Deutschland");
    expect(countryLabelForAlpha2("SK")).toBe("Slowakei");
    expect(countryLabelForAlpha2("xx")).toBe("XX");
  });
});

describe("Rechnung v2 — fixture renders", () => {
  it("renders the Beate-Uwe example (the reference)", async () => {
    const bytes = await renderRechnungV2({
      verein: VEREIN_FIXTURE,
      customer: {
        name: "Javid und Ücel GbR",
        addressBlock: "Beate Uwe Club\nSchillingstraße 31\n10179 Berlin",
        country: "DE",
      },
      rechnungsnummer: "VA-2026-02",
      rechnungsdatum: "2026-03-02",
      leistungszeitraum: "Februar 2026",
      bezeichnung: "Konzeption und Kuratierung der Kulturveranstaltung",
      leistungsBeschreibung: "“Beate Invites: Folge der Wolke” am 21.02.2026",
      nettoCents: 167570,
      kassenwaertName: "Annalena Feix",
    });
    await assertSensiblePdf(bytes);
    await writeOut("beate", bytes);
    // Commit a copy under tests/fixtures/expected for the baseline.
    const expectedPath = "tests/fixtures/expected/rechnung-v2-beate-uwe.pdf";
    await mkdir(dirname(expectedPath), { recursive: true });
    await writeFile(expectedPath, bytes);
  });

  it("renders WITHOUT a Zusatz line (2-line address)", async () => {
    const bytes = await renderRechnungV2({
      verein: VEREIN_FIXTURE,
      customer: {
        name: "Müller Kulturproduktion",
        addressBlock: "Hauptstraße 12\n80331 München",
        country: "DE",
      },
      rechnungsnummer: "FDW-2026-005",
      rechnungsdatum: "2026-04-10",
      leistungszeitraum: "März 2026",
      bezeichnung: "Veranstaltungstechnik",
      leistungsBeschreibung: null,
      nettoCents: 42000,
      kassenwaertName: "Julia Schwarz",
    });
    await assertSensiblePdf(bytes);
    await writeOut("no-zusatz", bytes);
  });

  it("renders WITH an extra Zusatz line (4-line address)", async () => {
    const bytes = await renderRechnungV2({
      verein: VEREIN_FIXTURE,
      customer: {
        name: "Festival Productions GmbH",
        addressBlock:
          "z.Hd. Frau Dr. Schmidt\nKulturzentrum 3. OG\nMaximilianstraße 42\n80539 München",
        country: "DE",
      },
      rechnungsnummer: "FDW-2026-006",
      rechnungsdatum: "2026-04-15",
      leistungszeitraum: "April 2026",
      bezeichnung: "Beratung und Konzeption Spielzeit-Eröffnung 2026/27",
      leistungsBeschreibung: "Mehrteilige Beratungsleistung im Q1/Q2",
      nettoCents: 95000,
      kassenwaertName: "Julia Schwarz",
    });
    await assertSensiblePdf(bytes);
    await writeOut("extra-zusatz", bytes);
  });

  it("renders WITH country line for non-German customer", async () => {
    const bytes = await renderRechnungV2({
      verein: VEREIN_FIXTURE,
      customer: {
        name: "Atelier Brezová s.r.o.",
        addressBlock: "Hviezdoslavovo nám. 14\n811 02 Bratislava",
        country: "SK",
      },
      rechnungsnummer: "FDW-2026-007",
      rechnungsdatum: "2026-04-20",
      leistungszeitraum: "April 2026",
      bezeichnung: "Künstlerische Beratung",
      leistungsBeschreibung: null,
      nettoCents: 120000,
      kassenwaertName: "Julia Schwarz",
    });
    await assertSensiblePdf(bytes);
    await writeOut("non-german", bytes);
  });

  it("renders umlauts in name + Bezeichnung correctly", async () => {
    const bytes = await renderRechnungV2({
      verein: VEREIN_FIXTURE,
      customer: {
        name: "Müller & Söhne GmbH",
        addressBlock: "Größenstraße 5\n80469 München",
        country: "DE",
      },
      rechnungsnummer: "FDW-2026-008",
      rechnungsdatum: "2026-05-01",
      leistungszeitraum: "Mai 2026",
      bezeichnung: "Übergröße: Künstlerische Leistung für die Veranstaltung",
      leistungsBeschreibung: "Wegen Größe der Bühne mit Übersetzung",
      nettoCents: 75000,
      kassenwaertName: "Julia Schwarz",
    });
    await assertSensiblePdf(bytes);
    await writeOut("umlauts", bytes);
  });

  it("renders a long Bezeichnung that wraps within the cell", async () => {
    const bytes = await renderRechnungV2({
      verein: VEREIN_FIXTURE,
      customer: {
        name: "Stadt München, Kulturreferat",
        addressBlock: "Burgstraße 4\n80331 München",
        country: "DE",
      },
      rechnungsnummer: "FDW-2026-009",
      rechnungsdatum: "2026-05-15",
      leistungszeitraum: "Mai 2026",
      bezeichnung:
        "Konzeption und Kuratierung der mehrtägigen Kulturveranstaltung mit besonderen Schwerpunkten auf experimentelles Musiktheater und post-modernes Tanzstück",
      leistungsBeschreibung: null,
      nettoCents: 250000,
      kassenwaertName: "Julia Schwarz",
    });
    await assertSensiblePdf(bytes);
    await writeOut("long-bezeichnung", bytes);
  });

  // Renamed from "empty-zeitraum" — empty Leistungszeitraum is now illegal
  // (§ 14 Abs. 4 Nr. 6 UStG). The renderer is exercised with the legal
  // fallback "Leistungsdatum entspricht Rechnungsdatum" instead.
  it("renders with the §31 UStDV fallback when service date = invoice date", async () => {
    const bytes = await renderRechnungV2({
      verein: VEREIN_FIXTURE,
      customer: {
        name: "Privatperson Max Mustermann",
        addressBlock: "Beispielstraße 1\n80331 München",
        country: "DE",
      },
      rechnungsnummer: "FDW-2026-010",
      rechnungsdatum: "2026-05-20",
      leistungszeitraum: "Leistungsdatum entspricht Rechnungsdatum",
      bezeichnung: "Künstlerische Beratung am 20.05.2026",
      leistungsBeschreibung: null,
      nettoCents: 30000,
      kassenwaertName: "Julia Schwarz",
    });
    await assertSensiblePdf(bytes);
    await writeOut("same-day-leistung", bytes);
  });

  // Renamed from "single-line" — § 14 Abs. 4 Nr. 1 UStG requires Straße + PLZ Ort
  // (≥ 2 lines). This fixture now uses a Postfach-style address spread across
  // two lines, which is the minimum legal address structure.
  it("renders with minimum-legal 2-line address (Postfach style)", async () => {
    const bytes = await renderRechnungV2({
      verein: VEREIN_FIXTURE,
      customer: {
        name: "Kleinstkunde e.K.",
        addressBlock: "Postfach 1234\n80331 München",
        country: "DE",
      },
      rechnungsnummer: "FDW-2026-011",
      rechnungsdatum: "2026-05-21",
      leistungszeitraum: "Mai 2026",
      bezeichnung: "Kuratorische Beratung Spielzeit 2026",
      leistungsBeschreibung: null,
      nettoCents: 10000,
      kassenwaertName: "Julia Schwarz",
    });
    await assertSensiblePdf(bytes);
    await writeOut("minimum-legal-address", bytes);
  });
});
