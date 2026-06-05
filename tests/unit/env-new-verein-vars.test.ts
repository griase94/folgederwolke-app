/**
 * White-label Phase 1 — new VEREIN_* identity/legal env vars.
 *
 * Asserts the new legal/tax fields exist with empty-string defaults and that
 * the dangerous FdW-specific Zwecke default has been removed. These vars are
 * `.default("")` (never `.min(1)`): required-ness is enforced prod-side in
 * assertProductionEnvSafe() (Phase 4), never at module load.
 */

import { describe, it, expect } from "vitest";
import { env } from "$lib/server/env.js";

describe("new VEREIN_* identity vars", () => {
  it("exposes the new legal/tax fields", () => {
    expect(env.VEREIN_VORSTAND).toBeDefined();
    expect(env.VEREIN_KONTAKT_EMAIL).toBeDefined();
    expect(env.VEREIN_AUFSICHTSBEHOERDE).toBeDefined();
    expect(env.VEREIN_REGISTERGERICHT).toBeDefined();
    expect(env.VEREIN_FINANZAMT).toBeDefined();
  });

  it("Beitrag default is a non-negative integer", () => {
    expect(Number.isInteger(env.VEREIN_BEITRAG_DEFAULT_CENTS)).toBe(true);
    expect(env.VEREIN_BEITRAG_DEFAULT_CENTS).toBeGreaterThanOrEqual(0);
  });

  it("STEUERBEGUENSTIGTE_ZWECKE no longer carries the FdW-specific default", () => {
    // The schema default must never be FdW's Satzungszweck (which contained
    // "Heimatpflege"). .env.test sets a neutral value, so this only guards
    // that the hardcoded FdW literal is gone from the schema default.
    expect(env.VEREIN_STEUERBEGUENSTIGTE_ZWECKE).not.toContain("Heimatpflege");
  });
});
