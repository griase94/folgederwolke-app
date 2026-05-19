/**
 * ZIP bundle — assembles all year-end export files into a single ZIP.
 *
 * Uses jszip. Returns a Buffer containing the ZIP bytes.
 */

import JSZip from "jszip";
import type { EurYearResult } from "$lib/server/domain/eur.js";
import type { SpendenlisteRow } from "./spendenliste-csv.js";
import type { BelegIndexRow } from "./beleg-index.js";
import { generateAnlageGemCsv } from "./anlage-gem-csv.js";
import { generateSpendenliste } from "./spendenliste-csv.js";
import { generateBelegIndex } from "./beleg-index.js";
import { generateGobdZ3Xml, generateGobdReadme } from "./gobd-z3.js";
import type { GobdExportInput } from "./gobd-z3.js";

export interface BundleInput {
  year: number;
  eur: EurYearResult;
  eurPdfBytes: Uint8Array | null;
  spenden: SpendenlisteRow[];
  belege: BelegIndexRow[];
  vereinName: string;
  vereinSteuernummer?: string;
  includeGobdZ3?: boolean;
}

/**
 * Assemble the Jahresabschluss ZIP bundle.
 * File structure:
 *   01_EÜR-{year}.pdf                    — EÜR summary PDF
 *   02_Anlage-Gem-{year}.csv             — Anlage Gem aggregation
 *   03_Spendenliste-{year}.csv           — BMF-required Spendenliste
 *   04_Beleg-Index-{year}.csv            — Beleg index with Drive links
 *   05_GoBD-Z3-{year}/                   — GoBD-Z3 IDEA-XML + README (optional)
 *     gobd_z3_{year}.xml
 *     README.md
 */
export async function buildJahresabschlussBundle(
  input: BundleInput,
): Promise<Buffer> {
  const {
    year,
    eur,
    eurPdfBytes,
    spenden,
    belege,
    vereinName,
    vereinSteuernummer,
  } = input;

  const zip = new JSZip();

  // 01 — EÜR PDF
  if (eurPdfBytes && eurPdfBytes.length > 0) {
    zip.file(`01_EÜR-${year}.pdf`, eurPdfBytes);
  }

  // 02 — Anlage Gem CSV
  const anlageGemCsv = generateAnlageGemCsv(eur);
  zip.file(`02_Anlage-Gem-${year}.csv`, anlageGemCsv);

  // 03 — Spendenliste CSV
  const spendenliste = generateSpendenliste(spenden);
  zip.file(`03_Spendenliste-${year}.csv`, spendenliste);

  // 04 — Beleg-Index CSV
  const belegIndex = generateBelegIndex(belege);
  zip.file(`04_Beleg-Index-${year}.csv`, belegIndex);

  // 05 — GoBD-Z3 IDEA-XML (optional)
  if (input.includeGobdZ3 !== false) {
    const gobdInput: GobdExportInput = {
      year,
      vereinName,
      vereinSteuernummer,
      exportedAt: new Date(),
      einnahmen: [
        ...eur.bySphere.ideeller.einnahmen,
        ...eur.bySphere.vermoegen.einnahmen,
        ...eur.bySphere.zweckbetrieb.einnahmen,
        ...eur.bySphere.wirtschaftlich.einnahmen,
      ],
      ausgaben: [
        ...eur.bySphere.ideeller.ausgaben,
        ...eur.bySphere.vermoegen.ausgaben,
        ...eur.bySphere.zweckbetrieb.ausgaben,
        ...eur.bySphere.wirtschaftlich.ausgaben,
      ],
      spenden,
    };
    const gobdXml = generateGobdZ3Xml(gobdInput);
    const gobdReadme = generateGobdReadme({ year, vereinName });
    const gobdFolder = zip.folder(`05_GoBD-Z3-${year}`);
    gobdFolder?.file(`gobd_z3_${year}.xml`, gobdXml);
    gobdFolder?.file("README.md", gobdReadme);
  }

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  return buffer;
}
