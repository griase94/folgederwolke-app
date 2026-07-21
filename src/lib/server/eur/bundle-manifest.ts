/**
 * Single source of the Jahresabschluss ZIP bundle's top-level entry names.
 *
 * The bundle writer (`export/bundle.ts`) builds the ZIP from these exact names,
 * and the export screens (ja-exports, gobd-export) render the same list — so a
 * screen can never advertise a filename the ZIP doesn't contain (the
 * "Manifest-Lüge" risk, D-Flow §4.5). Pure year → names; no I/O.
 */

export interface BundleFilenames {
  eurPdf: string;
  anlageGemCsv: string;
  spendenlisteCsv: string;
  belegIndexCsv: string;
  gobdFolder: string;
  gobdXml: string;
  gobdReadme: string;
  bescheinigungenFolder: string;
}

/** The exact filename fragments the bundle writer passes to JSZip. */
export function bundleFilenames(year: number): BundleFilenames {
  return {
    eurPdf: `01_EÜR-${year}.pdf`,
    anlageGemCsv: `02_Anlage-Gem-${year}.csv`,
    spendenlisteCsv: `03_Spendenliste-${year}.csv`,
    belegIndexCsv: `04_Beleg-Index-${year}.csv`,
    gobdFolder: `05_GoBD-Z3-${year}`,
    gobdXml: `gobd_z3_${year}.xml`,
    gobdReadme: "README.md",
    bescheinigungenFolder: `06_Bescheinigungen-${year}`,
  };
}

export interface BundleManifestEntry {
  /** Sort prefix (01, 02, …). */
  no: string;
  /** Full ZIP path (folder/file) — shown verbatim on the export screens. */
  path: string;
  /** Human label. */
  label: string;
  /** Conditionally present (empty EÜR PDF, GoBD disabled). */
  optional?: boolean;
  /** GoBD-Z3 — highlighted on the export screens (D-Flow §3b). */
  highlight?: boolean;
}

/** The display manifest for the export screens (derived from the same names). */
export function bundleManifest(year: number): BundleManifestEntry[] {
  const f = bundleFilenames(year);
  return [
    { no: "01", path: f.eurPdf, label: "EÜR-Übersicht (PDF)", optional: true },
    {
      no: "02",
      path: f.anlageGemCsv,
      label: "Anlage Gem — Sphären-Aggregation (CSV)",
    },
    {
      no: "03",
      path: f.spendenlisteCsv,
      label: "Spendenliste (CSV, BMF-Pflicht)",
    },
    {
      no: "04",
      path: f.belegIndexCsv,
      label: "Beleg-Index mit Datei-Links (CSV)",
    },
    {
      no: "05",
      path: `${f.gobdFolder}/${f.gobdXml}`,
      label: "GoBD-Z3 IDEA-XML (Betriebsprüfung)",
      optional: true,
      highlight: true,
    },
  ];
}
