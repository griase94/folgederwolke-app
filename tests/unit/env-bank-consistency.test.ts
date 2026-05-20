// @vitest-environment node
/**
 * @phase-1 @overnight-c8
 *
 * Cycle-2 expert review F2 — VEREIN_IBAN ↔ VEREIN_BIC consistency check.
 *
 * Backstop for the pre-existing bug surfaced by PR #44 cycle-1: the
 * (committed) cron + manual-reminder fallback values had IBAN
 * "DE25 8306 5408 ..." (BLZ 83065408 = Sparkasse Mittelthüringen, BIC
 * prefix HELADEF1) paired with BIC "BELADEBEXXX" (Berliner Sparkasse,
 * BLZ 10050000). Those are completely different banks — a BIC and an
 * IBAN-encoded BLZ MUST agree.
 *
 * `assertVereinBankConsistent` is the startup-time guard that prevents
 * this kind of misconfiguration from booting. It's intentionally
 * conservative (no-op when values are empty, no-op for unknown BLZs)
 * so it can't break dev/test setups while still catching the specific
 * class of bug we just saw.
 */

import { describe, expect, it } from "vitest";
import {
  assertVereinBankConsistent,
  extractDeBlz,
} from "../../src/lib/server/env.js";

describe("extractDeBlz", () => {
  it("extracts the 8-digit BLZ from a canonical DE IBAN", () => {
    expect(extractDeBlz("DE43830654089999999999")).toBe("83065408");
  });

  it("tolerates whitespace and case", () => {
    expect(extractDeBlz("de00 8306 5408 9999 9999 99")).toBe("83065408");
  });

  it("returns null for non-DE IBANs", () => {
    expect(extractDeBlz("AT611904300234573201")).toBeNull();
  });

  it("returns null for malformed DE input (wrong length)", () => {
    expect(extractDeBlz("DE2583065408")).toBeNull();
  });
});

describe("assertVereinBankConsistent", () => {
  it("REFUSES to boot when VEREIN_BIC and IBAN-encoded BLZ disagree (the PR-44 cycle-1 bug)", () => {
    // IBAN DE25 8306 5408 ... encodes BLZ 83065408 → Sparkasse Mittelthüringen
    // (BIC prefix HELADEF1). Pairing it with BELADEBEXXX (Berliner Sparkasse,
    // BLZ 10050000, BIC prefix BELADEBE) is internally inconsistent.
    expect(() =>
      assertVereinBankConsistent({
        iban: "DE43830654089999999999",
        bic: "BELADEBEXXX",
      }),
    ).toThrow(/IBAN.*BIC|BIC.*IBAN|mismatch/i);
  });

  it("accepts a matched IBAN/BIC pair (Sparkasse Mittelthüringen)", () => {
    expect(() =>
      assertVereinBankConsistent({
        iban: "DE43830654089999999999",
        bic: "HELADEF1WEM",
      }),
    ).not.toThrow();
  });

  it("accepts the 8-char short BIC form", () => {
    expect(() =>
      assertVereinBankConsistent({
        iban: "DE43830654089999999999",
        bic: "HELADEF1",
      }),
    ).not.toThrow();
  });

  it("is case-insensitive on the BIC", () => {
    expect(() =>
      assertVereinBankConsistent({
        iban: "DE43830654089999999999",
        bic: "heladef1wem",
      }),
    ).not.toThrow();
  });

  it("is a no-op when IBAN is empty (build-time tolerance)", () => {
    expect(() =>
      assertVereinBankConsistent({ iban: "", bic: "BELADEBEXXX" }),
    ).not.toThrow();
  });

  it("is a no-op when BIC is empty (build-time tolerance)", () => {
    expect(() =>
      assertVereinBankConsistent({
        iban: "DE43830654089999999999",
        bic: "",
      }),
    ).not.toThrow();
  });

  it("is a no-op for non-DE IBANs (only DE BLZ ↔ BIC is enforced)", () => {
    // AT IBAN paired with an arbitrary BIC — we have no Austrian BLZ table
    // and don't claim to validate it.
    expect(() =>
      assertVereinBankConsistent({
        iban: "AT611904300234573201",
        bic: "BKAUATWW",
      }),
    ).not.toThrow();
  });

  it("is a no-op when the BLZ is not in the curated whitelist (advisory only)", () => {
    // Made-up BLZ that isn't in our table → no assertion possible, no throw.
    expect(() =>
      assertVereinBankConsistent({
        iban: "DE89370400440532013000", // Commerzbank Köln (BLZ 37040044) — not in our table
        bic: "DEUTDEDBPAL", // intentionally a different bank
      }),
    ).not.toThrow();
  });
});
