/**
 * Phase 9 Task 18 — bundle.zip extension for 09_Belege-{year}/ subfolder.
 *
 * Verifies that buildJahresabschlussBundle() embeds Beleg files into a
 * sphere-aware folder layout when `belegAttachments` is provided.
 */
import { describe, it, expect } from "vitest";
import {
  buildJahresabschlussBundle,
  type BelegAttachment,
} from "$lib/server/export/bundle.js";
import JSZip from "jszip";

describe("bundle.zip — 09_Belege-{year}/", () => {
  it("includes Beleg files in sphere-aware subfolders with matching bytes", async () => {
    // Minimal EUR result so the bundle compiles.
    const eur = {
      year: 2026,
      bySphere: {
        ideeller: { einnahmen: [], ausgaben: [] },
        vermoegen: { einnahmen: [], ausgaben: [] },
        zweckbetrieb: { einnahmen: [], ausgaben: [] },
        wirtschaftlich: { einnahmen: [], ausgaben: [] },
      },
    };

    const bytes1 = new Uint8Array([
      0x25,
      0x50,
      0x44,
      0x46,
      ...new Array(100).fill(1),
    ]);
    const bytes2 = new Uint8Array([
      0x25,
      0x50,
      0x44,
      0x46,
      ...new Array(100).fill(2),
    ]);

    const belegAttachments: BelegAttachment[] = [
      {
        bundlePath: "ausgaben/ideeller/A-2026-0001-test.pdf",
        bytes: bytes1,
      },
      {
        bundlePath: "einnahmen/zweckbetrieb/I-2026-0001-test.pdf",
        bytes: bytes2,
      },
    ];

    const buf = await buildJahresabschlussBundle({
      year: 2026,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eur: eur as any,
      eurPdfBytes: null,
      spenden: [],
      belege: [],
      vereinName: "Test Verein",
      belegAttachments,
    });

    const zip = await JSZip.loadAsync(buf);
    expect(
      zip.file("09_Belege-2026/ausgaben/ideeller/A-2026-0001-test.pdf"),
    ).not.toBeNull();
    expect(
      zip.file("09_Belege-2026/einnahmen/zweckbetrieb/I-2026-0001-test.pdf"),
    ).not.toBeNull();

    const file1Bytes = new Uint8Array(
      await zip
        .file("09_Belege-2026/ausgaben/ideeller/A-2026-0001-test.pdf")!
        .async("uint8array"),
    );
    expect(file1Bytes).toEqual(bytes1);

    const file2Bytes = new Uint8Array(
      await zip
        .file("09_Belege-2026/einnahmen/zweckbetrieb/I-2026-0001-test.pdf")!
        .async("uint8array"),
    );
    expect(file2Bytes).toEqual(bytes2);
  });

  it("omits the 09_Belege folder entirely when no attachments are passed", async () => {
    const eur = {
      year: 2026,
      bySphere: {
        ideeller: { einnahmen: [], ausgaben: [] },
        vermoegen: { einnahmen: [], ausgaben: [] },
        zweckbetrieb: { einnahmen: [], ausgaben: [] },
        wirtschaftlich: { einnahmen: [], ausgaben: [] },
      },
    };

    const buf = await buildJahresabschlussBundle({
      year: 2026,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eur: eur as any,
      eurPdfBytes: null,
      spenden: [],
      belege: [],
      vereinName: "Test Verein",
    });

    const zip = await JSZip.loadAsync(buf);
    // No 09_ entries should exist.
    const names = Object.keys(zip.files).filter((n) =>
      n.startsWith("09_Belege"),
    );
    expect(names).toEqual([]);
  });
});
