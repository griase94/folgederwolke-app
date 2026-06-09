/**
 * @phase-7.5
 *
 * Tests for the legal-document loader (Impressum + Datenschutzerklärung).
 *
 * Regression net for DSGVO CRIT-01 / UX CRIT-2 / Julia MUST-5: the loader
 * used to return markdown verbatim, so `/impressum` published literal
 * `[VEREIN_ADRESSE]` text — a § 5 TMG violation. The loader now substitutes
 * `[VEREIN_*]` tokens against env at load time.
 *
 * The markdown is bundled at build time via `import.meta.glob('…?raw')` (so the
 * legal pages render in the Vercel serverless function, which does not include
 * the repo's docs/ dir). The substitution contract is therefore unit-tested via
 * the exported `substituteVereinPlaceholders`, and version-selection via the
 * real bundled docs — no scratch files / `process.chdir` needed.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

describe("loadCurrentLegalDoc — placeholder substitution contract", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("substitutes a known [VEREIN_*] token from env", async () => {
    vi.stubEnv("VEREIN_ADRESSE", "Westermühlstraße 6, 80469 München");
    const { substituteVereinPlaceholders } =
      await import("$lib/server/legal/loader.js");
    const out = substituteVereinPlaceholders("Adresse: [VEREIN_ADRESSE]");
    expect(out).toContain("Westermühlstraße 6, 80469 München");
    expect(out).not.toContain("[VEREIN_ADRESSE]");
  });

  it("renders a multi-line value (VEREIN_ADRESSE with a c/o line) as <br>-separated lines", async () => {
    vi.stubEnv(
      "VEREIN_ADRESSE",
      "c/o Jonas Hackenberg\nWestermühlstraße 6\n80469 München",
    );
    const { substituteVereinPlaceholders } =
      await import("$lib/server/legal/loader.js");
    expect(substituteVereinPlaceholders("[VEREIN_ADRESSE]")).toBe(
      "c/o Jonas Hackenberg<br>Westermühlstraße 6<br>80469 München",
    );
  });

  it("normalises a literal backslash-n in a multi-line value to <br>", async () => {
    vi.stubEnv("VEREIN_ADRESSE", "c/o A\\nStraße 1\\n12345 Stadt");
    const { substituteVereinPlaceholders } =
      await import("$lib/server/legal/loader.js");
    expect(substituteVereinPlaceholders("[VEREIN_ADRESSE]")).toBe(
      "c/o A<br>Straße 1<br>12345 Stadt",
    );
  });

  it("leaves unknown placeholders in place (visible bug, not silent empty)", async () => {
    const { substituteVereinPlaceholders } =
      await import("$lib/server/legal/loader.js");
    expect(
      substituteVereinPlaceholders("Mystery field: [VEREIN_BOGUS_FIELD]"),
    ).toContain("[VEREIN_BOGUS_FIELD]");
  });

  it("does NOT touch non-VEREIN bracketed text (e.g. markdown link refs)", async () => {
    const { substituteVereinPlaceholders } =
      await import("$lib/server/legal/loader.js");
    const out = substituteVereinPlaceholders(
      "Siehe [Datenschutz](/datenschutz)\n[NICHT_VEREIN]",
    );
    expect(out).toContain("[Datenschutz](/datenschutz)");
    expect(out).toContain("[NICHT_VEREIN]");
  });

  it("picks the highest version from the bundled docs (datenschutz ships v1 + v2 → v2)", async () => {
    const { loadCurrentLegalDoc } = await import("$lib/server/legal/loader.js");
    const doc = await loadCurrentLegalDoc("datenschutzerklaerung");
    expect(doc.version).toBe("v2");
  });
});

/**
 * White-label PR3 — tokenization of the REAL docs/legal/ markdown.
 *
 * These tests load the actual shipped impressum/datenschutz files (bundled via
 * import.meta.glob), so they regress against FdW-identity literals leaking back
 * into the legal text.
 */
describe("loadCurrentLegalDoc — real docs tokenization (white-label PR3)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("impressum substitutes Vorstand / Kontakt-Email / Registergericht and drops FdW literals", async () => {
    vi.stubEnv("VEREIN_NAME", "Verein X e.V.");
    vi.stubEnv("VEREIN_VORSTAND", "P. Erson");
    vi.stubEnv("VEREIN_KONTAKT_EMAIL", "x@y.de");
    vi.stubEnv("VEREIN_REGISTERGERICHT", "Amtsgericht Z");

    const { loadCurrentLegalDoc } = await import("$lib/server/legal/loader.js");
    const doc = await loadCurrentLegalDoc("impressum");

    // Configured values are substituted in.
    expect(doc.markdown).toContain("P. Erson");
    expect(doc.markdown).toContain("x@y.de");
    expect(doc.markdown).toContain("Amtsgericht Z");

    // No hardcoded FdW identity survives.
    expect(doc.markdown).not.toContain("Andy Griesbeck");
    expect(doc.markdown).not.toContain("andy@folgederwolke.de");
    expect(doc.markdown).not.toContain("Folge der Wolke e.V.");

    // No un-substituted tokens remain for the configured fields.
    expect(doc.markdown).not.toContain("[VEREIN_VORSTAND]");
    expect(doc.markdown).not.toContain("[VEREIN_KONTAKT_EMAIL]");
    expect(doc.markdown).not.toContain("[VEREIN_REGISTERGERICHT]");
    expect(doc.markdown).not.toContain("[VEREIN_NAME]");
  });

  it("impressum stacks a multi-line c/o address under the name (DIN 5008)", async () => {
    vi.stubEnv("VEREIN_NAME", "Verein X e.V.");
    vi.stubEnv(
      "VEREIN_ADRESSE",
      "c/o Max Muster\nMusterstraße 1\n12345 Musterstadt",
    );
    const { loadCurrentLegalDoc } = await import("$lib/server/legal/loader.js");
    const doc = await loadCurrentLegalDoc("impressum");

    // The name is hard-broken from the address block…
    expect(doc.markdown).toContain("**Verein X e.V.**<br>");
    // …and the postal lines stack: c/o, street, PLZ Ort.
    expect(doc.markdown).toContain(
      "c/o Max Muster<br>Musterstraße 1<br>12345 Musterstadt",
    );
  });

  it("datenschutz is version v2, substitutes name/Kontakt/Aufsichtsbehörde, drops BayLDA literals", async () => {
    vi.stubEnv("VEREIN_NAME", "Verein X e.V.");
    vi.stubEnv("VEREIN_KONTAKT_EMAIL", "x@y.de");
    vi.stubEnv(
      "VEREIN_AUFSICHTSBEHOERDE",
      "Aufsicht Q, Musterstr. 1, 12345 Musterstadt",
    );

    const { loadCurrentLegalDoc } = await import("$lib/server/legal/loader.js");
    const doc = await loadCurrentLegalDoc("datenschutzerklaerung");

    // Loader auto-picks the highest version.
    expect(doc.version).toBe("v2");

    // Configured values are substituted in.
    expect(doc.markdown).toContain("Verein X e.V.");
    expect(doc.markdown).toContain("x@y.de");
    expect(doc.markdown).toContain(
      "Aufsicht Q, Musterstr. 1, 12345 Musterstadt",
    );

    // No hardcoded FdW / BayLDA identity survives.
    expect(doc.markdown).not.toContain("BayLDA");
    expect(doc.markdown).not.toContain("Ansbach");
    expect(doc.markdown).not.toContain("andy@folgederwolke.de");

    // No un-substituted tokens remain for the configured fields.
    expect(doc.markdown).not.toContain("[VEREIN_NAME]");
    expect(doc.markdown).not.toContain("[VEREIN_KONTAKT_EMAIL]");
    expect(doc.markdown).not.toContain("[VEREIN_AUFSICHTSBEHOERDE]");
  });
});
