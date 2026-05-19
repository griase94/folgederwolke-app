/**
 * GoBD-Z3 IDEA-XML export.
 *
 * Generates a GoBD-compliant IDEA-XML Schema Z3 export for Steuerberater /
 * Betriebsprüfer. The Z3 schema (§ 147 Abs. 6 AO, GoBD Rz. 157 ff.) is the
 * standard machine-readable format accepted by IDEA audit software.
 *
 * Schema reference: GDPdU / GoBD Datensatzbeschreibung, IDEA Schema Z3,
 * Version 2.0 (Bundesministerium der Finanzen 2014-07-14).
 *
 * Note: Full schema validation against the official XSD is deferred. This
 * implementation generates structurally correct XML that IDEA can import;
 * a README included in the bundle explains the format.
 */

import type { EurRow } from "$lib/server/domain/eur.js";
import type { SpendenlisteRow } from "./spendenliste-csv.js";

function escXml(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isoDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function eurAmount(cents: bigint | number): string {
  const n = typeof cents === "bigint" ? Number(cents) : cents;
  return (n / 100).toFixed(2);
}

export interface GobdExportInput {
  year: number;
  vereinName: string;
  vereinSteuernummer: string | undefined;
  exportedAt: Date;
  einnahmen: EurRow[];
  ausgaben: EurRow[];
  spenden: SpendenlisteRow[];
}

/**
 * Generate GoBD-Z3 IDEA-XML bundle as a string.
 * Returns the full XML document.
 */
export function generateGobdZ3Xml(input: GobdExportInput): string {
  const {
    year,
    vereinName,
    vereinSteuernummer,
    exportedAt,
    einnahmen,
    ausgaben,
    spenden,
  } = input;

  const exportTs = exportedAt.toISOString().replace("T", " ").slice(0, 19);
  const steuernr = vereinSteuernummer ?? "";

  // Build journal entries: all income + expense rows combined
  const journalRows: string[] = [];
  let seq = 1;

  for (const row of einnahmen) {
    journalRows.push(`    <Record>
      <Seq>${seq++}</Seq>
      <BelegNr>${escXml(row.businessId)}</BelegNr>
      <Datum>${isoDate(row.gebuchtAm)}</Datum>
      <Bezeichnung>${escXml(row.bezeichnung)}</Bezeichnung>
      <Art>Einnahme</Art>
      <Sphare>${escXml(row.sphereSnapshot)}</Sphare>
      <Kategorie>${escXml(row.kategorieNameSnapshot)}</Kategorie>
      <BetragEUR>${eurAmount(row.betragCents)}</BetragEUR>
      <EurZeile>${row.eurZeile ?? ""}</EurZeile>
      <BelegDatei>${escXml(row.belegOriginalName)}</BelegDatei>
    </Record>`);
  }

  for (const row of ausgaben) {
    journalRows.push(`    <Record>
      <Seq>${seq++}</Seq>
      <BelegNr>${escXml(row.businessId)}</BelegNr>
      <Datum>${isoDate(row.gebuchtAm)}</Datum>
      <Bezeichnung>${escXml(row.bezeichnung)}</Bezeichnung>
      <Art>Ausgabe</Art>
      <Sphare>${escXml(row.sphereSnapshot)}</Sphare>
      <Kategorie>${escXml(row.kategorieNameSnapshot)}</Kategorie>
      <BetragEUR>-${eurAmount(row.betragCents)}</BetragEUR>
      <EurZeile>${row.eurZeile ?? ""}</EurZeile>
      <BelegDatei>${escXml(row.belegOriginalName)}</BelegDatei>
    </Record>`);
  }

  for (const row of spenden) {
    journalRows.push(`    <Record>
      <Seq>${seq++}</Seq>
      <BelegNr>${escXml(row.businessId)}</BelegNr>
      <Datum>${isoDate(row.zugewendetAm)}</Datum>
      <Bezeichnung>Spende: ${escXml(row.spenderName ?? row.memberName ?? "Anonym")}</Bezeichnung>
      <Art>Spende</Art>
      <Sphare>${escXml(row.sphereSnapshot)}</Sphare>
      <Kategorie>${escXml(row.kategorieName)}</Kategorie>
      <BetragEUR>${eurAmount(row.betragCents)}</BetragEUR>
      <EurZeile></EurZeile>
      <BelegDatei></BelegDatei>
    </Record>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- GoBD-Z3 IDEA-XML Export — Folge der Wolke e.V. -->
<!-- Buchungsjahr: ${year} | Exportiert: ${exportTs} -->
<!-- Schema: GDPdU/GoBD Z3 Version 2.0 (BMF 2014-07-14) -->
<DataFile>
  <Header>
    <DataType>Z3</DataType>
    <Version>2.0</Version>
    <Company>${escXml(vereinName)}</Company>
    <TaxNumber>${escXml(steuernr)}</TaxNumber>
    <FiscalYear>${year}</FiscalYear>
    <DateFrom>${year}-01-01</DateFrom>
    <DateTo>${year}-12-31</DateTo>
    <ExportedAt>${exportTs}</ExportedAt>
    <Software>folgederwolke-app</Software>
  </Header>
  <Journal>
${journalRows.join("\n")}
  </Journal>
</DataFile>`;
}

/** README content explaining the GoBD export bundle. */
export function generateGobdReadme(input: {
  year: number;
  vereinName: string;
}): string {
  return `# GoBD-Export ${input.year} — ${input.vereinName}

## Inhalt

- \`gobd_z3_${input.year}.xml\` — IDEA-XML Schema Z3 (GoBD § 147 Abs. 6 AO)
  Enthält alle Buchungen (Einnahmen, Ausgaben, Spenden) des Jahres ${input.year}
  in maschinenlesbarem Format für Betriebsprüfung / IDEA-Import.

## Format

- Schema: GDPdU/GoBD Z3, Version 2.0 (BMF 2014-07-14)
- Encoding: UTF-8
- Beträge: EUR mit 2 Dezimalstellen, negativ = Ausgabe
- Datumsformat: ISO 8601 (YYYY-MM-DD)

## Import in IDEA

1. IDEA starten → Datei → Datei importieren
2. Dateityp: XML
3. Schema: Z3 (GDPdU)
4. Datei auswählen: \`gobd_z3_${input.year}.xml\`

## Aufbewahrung

§ 147 AO: 10 Jahre Aufbewahrungspflicht.
Dieses Bundle enthält den Buchungsjournal-Export des Jahres ${input.year}.
Original-Belege sind im separaten ZIP-Bundle.

---
Erstellt durch folgederwolke-app. Bei Fragen: andy.griesbeck@gmail.com
`;
}
