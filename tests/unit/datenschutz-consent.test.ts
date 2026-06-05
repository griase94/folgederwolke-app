/**
 * White-label PR3 — public-form consent text parameterization (Task 3.4).
 *
 * `$lib/domain/datenschutz.ts` is client-importable, so its contact email must
 * come from a build-time `PUBLIC_` var (`$env/static/public`), never the
 * server-side env object. These tests pin:
 *   - the consent email is sourced from PUBLIC_VEREIN_KONTAKT_EMAIL
 *     (`.env.test` sets it to info@test-verein.de),
 *   - no hardcoded FdW email literal survives in the consent text,
 *   - DATENSCHUTZ_VERSION is the bumped value (stored consents are immutable
 *     snapshots — the server validates submissions against this constant).
 */

import { describe, expect, it } from "vitest";
import {
  DATENSCHUTZ_TEXT,
  DATENSCHUTZ_VERSION,
} from "$lib/domain/datenschutz.js";

describe("DATENSCHUTZ consent text (white-label PR3)", () => {
  it("sources the contact email from PUBLIC_VEREIN_KONTAKT_EMAIL", () => {
    // .env.test sets PUBLIC_VEREIN_KONTAKT_EMAIL=info@test-verein.de
    expect(DATENSCHUTZ_TEXT).toContain("info@test-verein.de");
  });

  it("contains no hardcoded FdW email literal", () => {
    expect(DATENSCHUTZ_TEXT).not.toContain("folgederwolke@gmail.com");
    expect(DATENSCHUTZ_TEXT).not.toContain("andy@folgederwolke.de");
  });

  it("DATENSCHUTZ_VERSION is the bumped white-label value", () => {
    expect(DATENSCHUTZ_VERSION).toBe("2026-06-05-v2");
  });
});
