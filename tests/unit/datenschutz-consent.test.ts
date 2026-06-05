/**
 * White-label — public-form consent text parameterization.
 *
 * `$lib/domain/datenschutz.ts` is client-importable, so it must NOT read `$env`
 * (which can't resolve in both the production build and the browser-conditions
 * vitest run). The contact email is injected by the caller via
 * `datenschutzText(kontaktEmail)` — server-provided through the root layout's
 * `kontaktEmail` (env.VEREIN_KONTAKT_EMAIL). These tests pin:
 *   - the injected contact email appears in the consent text,
 *   - no hardcoded FdW email literal survives,
 *   - DATENSCHUTZ_VERSION is the bumped value (stored consents are immutable
 *     snapshots — the server validates submissions against this constant).
 */

import { describe, expect, it } from "vitest";
import {
  datenschutzText,
  DATENSCHUTZ_VERSION,
} from "$lib/domain/datenschutz.js";

describe("datenschutzText (white-label consent text)", () => {
  it("injects the provided runtime contact email", () => {
    expect(datenschutzText("info@test-verein.de")).toContain(
      "info@test-verein.de",
    );
  });

  it("contains no hardcoded FdW email literal", () => {
    const text = datenschutzText("info@test-verein.de");
    expect(text).not.toContain("folgederwolke@gmail.com");
    expect(text).not.toContain("andy@folgederwolke.de");
  });

  it("DATENSCHUTZ_VERSION is the bumped white-label value", () => {
    expect(DATENSCHUTZ_VERSION).toBe("2026-06-05-v2");
  });
});
