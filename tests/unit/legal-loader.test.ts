/**
 * @phase-7.5
 *
 * Tests for the legal-document loader (Impressum + Datenschutzerklärung).
 *
 * Regression net for DSGVO CRIT-01 / UX CRIT-2 / Julia MUST-5: the loader
 * used to return markdown verbatim, so `/impressum` published literal
 * `[VEREIN_ADRESSE]` text — a § 5 TMG violation. The loader now substitutes
 * `[VEREIN_*]` tokens against env at load time.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("loadCurrentLegalDoc — placeholder substitution", () => {
  let scratch: string;
  let originalCwd: string;

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();

    scratch = mkdtempSync(join(tmpdir(), "legal-loader-"));
    mkdirSync(join(scratch, "docs", "legal", "impressum-versionen"), {
      recursive: true,
    });
    mkdirSync(
      join(scratch, "docs", "legal", "datenschutzerklaerung-versionen"),
      { recursive: true },
    );

    originalCwd = process.cwd();
    process.chdir(scratch);
  });

  function afterEach_() {
    process.chdir(originalCwd);
  }

  it("substitutes [VEREIN_ADRESSE] with env.VEREIN_ADRESSE", async () => {
    writeFileSync(
      join(scratch, "docs/legal/impressum-versionen/v1.md"),
      "# Impressum\nAdresse: [VEREIN_ADRESSE]\n",
    );
    vi.stubEnv("VEREIN_ADRESSE", "Westermühlstraße 6, 80469 München");

    const { loadCurrentLegalDoc } = await import("$lib/server/legal/loader.js");
    const doc = await loadCurrentLegalDoc("impressum");
    expect(doc.markdown).toContain("Westermühlstraße 6, 80469 München");
    expect(doc.markdown).not.toContain("[VEREIN_ADRESSE]");
    afterEach_();
  });

  it("substitutes multiple placeholders in the same document", async () => {
    writeFileSync(
      join(scratch, "docs/legal/impressum-versionen/v1.md"),
      [
        "Name: [VEREIN_NAME]",
        "Steuernummer: [VEREIN_STEUERNUMMER]",
        "VR: [VEREIN_VR]",
      ].join("\n"),
    );
    vi.stubEnv("VEREIN_NAME", "Folge der Wolke e.V.");
    vi.stubEnv("VEREIN_STEUERNUMMER", "143/215/10028");
    vi.stubEnv("VEREIN_VR", "VR 211227");

    const { loadCurrentLegalDoc } = await import("$lib/server/legal/loader.js");
    const doc = await loadCurrentLegalDoc("impressum");
    expect(doc.markdown).toContain("Folge der Wolke e.V.");
    expect(doc.markdown).toContain("143/215/10028");
    expect(doc.markdown).toContain("VR 211227");
    afterEach_();
  });

  it("leaves unknown placeholders in place (visible bug, not silent empty)", async () => {
    writeFileSync(
      join(scratch, "docs/legal/impressum-versionen/v1.md"),
      "Mystery field: [VEREIN_BOGUS_FIELD]\n",
    );
    const { loadCurrentLegalDoc } = await import("$lib/server/legal/loader.js");
    const doc = await loadCurrentLegalDoc("impressum");
    // The token should still be visible so reviewers spot the typo.
    expect(doc.markdown).toContain("[VEREIN_BOGUS_FIELD]");
    afterEach_();
  });

  it("does NOT touch non-VEREIN bracketed text (e.g. markdown link refs)", async () => {
    writeFileSync(
      join(scratch, "docs/legal/impressum-versionen/v1.md"),
      "Siehe [Datenschutz](/datenschutz)\n[NICHT_VEREIN]\n",
    );
    const { loadCurrentLegalDoc } = await import("$lib/server/legal/loader.js");
    const doc = await loadCurrentLegalDoc("impressum");
    expect(doc.markdown).toContain("[Datenschutz](/datenschutz)");
    expect(doc.markdown).toContain("[NICHT_VEREIN]");
    afterEach_();
  });

  it("picks the latest version when multiple exist (numeric sort)", async () => {
    const dir = join(scratch, "docs/legal/impressum-versionen");
    writeFileSync(join(dir, "v1.md"), "old\n");
    writeFileSync(join(dir, "v2.md"), "newer\n");
    writeFileSync(join(dir, "v10.md"), "newest\n");

    const { loadCurrentLegalDoc } = await import("$lib/server/legal/loader.js");
    const doc = await loadCurrentLegalDoc("impressum");
    expect(doc.version).toBe("v10");
    expect(doc.markdown.trim()).toBe("newest");
    afterEach_();
  });
});
