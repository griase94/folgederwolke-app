/**
 * @phase-9
 *
 * D-Flow §4.5 — the bundle manifest is the single source of the ZIP entry
 * names. bundle.ts builds the ZIP from bundleFilenames(); the export screens
 * render bundleManifest(). These tests lock the exact names so a screen can
 * never advertise a filename the writer doesn't produce (Manifest-Lüge guard).
 */
import { describe, it, expect } from "vitest";
import {
  bundleFilenames,
  bundleManifest,
} from "$lib/server/eur/bundle-manifest.js";

describe("bundleFilenames", () => {
  it("produces the canonical year-scoped entry names", () => {
    expect(bundleFilenames(2025)).toEqual({
      eurPdf: "01_EÜR-2025.pdf",
      anlageGemCsv: "02_Anlage-Gem-2025.csv",
      spendenlisteCsv: "03_Spendenliste-2025.csv",
      belegIndexCsv: "04_Beleg-Index-2025.csv",
      gobdFolder: "05_GoBD-Z3-2025",
      gobdXml: "gobd_z3_2025.xml",
      gobdReadme: "README.md",
      bescheinigungenFolder: "06_Bescheinigungen-2025",
    });
  });
});

describe("bundleManifest", () => {
  it("display paths derive from the same filename source (no drift)", () => {
    const f = bundleFilenames(2025);
    const paths = bundleManifest(2025).map((e) => e.path);
    expect(paths).toEqual([
      f.eurPdf,
      f.anlageGemCsv,
      f.spendenlisteCsv,
      f.belegIndexCsv,
      `${f.gobdFolder}/${f.gobdXml}`,
    ]);
  });

  it("marks the GoBD-Z3 entry as the highlighted, optional export", () => {
    const gobd = bundleManifest(2025).find((e) => e.no === "05");
    expect(gobd?.highlight).toBe(true);
    expect(gobd?.optional).toBe(true);
    expect(gobd?.path).toContain("gobd_z3_2025.xml");
  });
});
