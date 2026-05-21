/**
 * Unit coverage for bundle-paths helpers (Phase 9 test-gap closure).
 *
 * Each assertion targets a specific Steuerberater-facing regression the
 * post-merge expert audit flagged as silently-missing today.
 */

import { describe, it, expect } from "vitest";
import {
  slugify,
  bundlePath,
  extFromMime,
} from "$lib/server/export/bundle-paths.js";

describe("slugify", () => {
  it("maps ä/ö/ü/ß to ae/oe/ue/ss BEFORE lowercase", () => {
    // German-aware umlaut handling. If umlauts were stripped after lowercase
    // the result would be "buromaterial" — silently wrong filenames in the
    // Steuerberater bundle. The implementation MUST replace before lowercasing.
    expect(slugify("Büromaterial")).toBe("bueromaterial");
    expect(slugify("Größe")).toBe("groesse");
    expect(slugify("Übergröße")).toBe("uebergroesse");
    expect(slugify("ÄÖÜß")).toBe("aeoeuess");
  });

  it("collapses non-alphanumeric runs to single dashes + strips edges", () => {
    expect(slugify("Rechnung Nr. 42 / 2026!")).toBe("rechnung-nr-42-2026");
    expect(slugify("  leading  +  trailing  ")).toBe("leading-trailing");
    expect(slugify("a___b")).toBe("a-b");
  });

  it("truncates to maxLen (default 40) so bundle paths stay predictable", () => {
    const long =
      "A really long descriptive Beleg name that goes well beyond forty characters";
    expect(slugify(long).length).toBeLessThanOrEqual(40);
    // explicit override
    expect(slugify(long, 10).length).toBeLessThanOrEqual(10);
  });

  it("returns empty string for input with no slug chars (bundlePath handles this)", () => {
    // The empty case is real: bundlePath compensates by falling back to
    // businessId-only when slug is empty. This test documents the contract
    // so a future refactor doesn't accidentally introduce a non-empty
    // default that would break that fallback.
    expect(slugify("////")).toBe("");
    expect(slugify("///")).toBe("");
    expect(slugify("")).toBe("");
  });
});

describe("extFromMime", () => {
  it("maps the prod-allowed MIME types", () => {
    expect(extFromMime("application/pdf")).toBe("pdf");
    expect(extFromMime("image/jpeg")).toBe("jpg");
    expect(extFromMime("image/jpg")).toBe("jpg");
    expect(extFromMime("image/png")).toBe("png");
    expect(extFromMime("image/heic")).toBe("heic");
    expect(extFromMime("image/heif")).toBe("heif");
    expect(extFromMime("image/webp")).toBe("webp");
  });

  it("is case-insensitive on the MIME input", () => {
    expect(extFromMime("APPLICATION/PDF")).toBe("pdf");
    expect(extFromMime("Image/JPEG")).toBe("jpg");
  });

  it("falls back to 'bin' for unknown MIME (defensive — never strips extension)", () => {
    expect(extFromMime("application/octet-stream")).toBe("bin");
    expect(extFromMime("application/zip")).toBe("bin");
    expect(extFromMime("")).toBe("bin");
  });
});

describe("bundlePath", () => {
  it("maps expense → ausgaben/{sphere}/ with single-dash businessId-slug", () => {
    expect(
      bundlePath({
        businessId: "AUS-001",
        ownerKind: "expense",
        sphere: "ideeller",
        bezeichnung: "Büromaterial",
        ext: "pdf",
      }),
    ).toBe("ausgaben/ideeller/AUS-001-bueromaterial.pdf");
  });

  it("maps income → einnahmen/{sphere}/ with single-dash businessId-slug", () => {
    expect(
      bundlePath({
        businessId: "EIN-042",
        ownerKind: "income",
        sphere: "zweckbetrieb",
        bezeichnung: "Ticketverkauf 2026",
        ext: "pdf",
      }),
    ).toBe("einnahmen/zweckbetrieb/EIN-042-ticketverkauf-2026.pdf");
  });

  it("maps donation → spenden/ (NO sphere subfolder; donations are always ideeller)", () => {
    expect(
      bundlePath({
        businessId: "SPE-007",
        ownerKind: "donation",
        sphere: "ideeller",
        bezeichnung: "Geldspende",
        ext: "pdf",
      }),
    ).toBe("spenden/SPE-007-geldspende.pdf");
  });

  it("falls back to businessId-only when slug is empty (slugify returned '')", () => {
    expect(
      bundlePath({
        businessId: "AUS-002",
        ownerKind: "expense",
        sphere: "ideeller",
        bezeichnung: "////", // slugifies to ""
        ext: "pdf",
      }),
    ).toBe("ausgaben/ideeller/AUS-002.pdf");
  });

  it("falls back to businessId-only when bezeichnung is null/undefined", () => {
    expect(
      bundlePath({
        businessId: "AUS-003",
        ownerKind: "expense",
        sphere: "ideeller",
        bezeichnung: null,
        ext: "pdf",
      }),
    ).toBe("ausgaben/ideeller/AUS-003.pdf");
  });

  it("falls back to 'ohne-sphaere' folder when sphere is missing", () => {
    // Defensive: a Beleg with no sphere assignment should still land in
    // the bundle (not crash, not vanish). ohne-sphaere lets the Steuerberater
    // spot the gap.
    expect(
      bundlePath({
        businessId: "AUS-004",
        ownerKind: "expense",
        sphere: null,
        bezeichnung: "Misc",
        ext: "pdf",
      }),
    ).toBe("ausgaben/ohne-sphaere/AUS-004-misc.pdf");
  });

  it("uses umlaut-aware slug for German bezeichnung", () => {
    // Steuerberater regression: if umlauts run AFTER lowercase, "Übergröße"
    // becomes "bergre" instead of "uebergroesse".
    expect(
      bundlePath({
        businessId: "AUS-005",
        ownerKind: "expense",
        sphere: "ideeller",
        bezeichnung: "Übergröße",
        ext: "pdf",
      }),
    ).toBe("ausgaben/ideeller/AUS-005-uebergroesse.pdf");
  });
});
