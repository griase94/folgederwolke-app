// @vitest-environment node
/**
 * @phase-1 @overnight-c8
 *
 * Cycle-2 expert review F2 — cron + manual-reminder bank data threading.
 *
 * BEFORE: both call sites contained string-literal fallbacks for IBAN,
 * BIC, Bankname, and Empfänger. When VEREIN_* env vars were unset (which
 * was the case for all dev/test envs), reminders went out with hardcoded
 * placeholder values — and the placeholder IBAN encoded Deutsche Skatbank
 * (BLZ 83065408) but the placeholder BIC was Berliner Sparkasse's
 * (BELADEBEXXX, BLZ 10050000), so the data was outright wrong, not just
 * stale.
 *
 * AFTER: both call sites read exclusively from env.VEREIN_*. If any
 * required env var is unset, the action refuses to run instead of
 * silently sending wrong bank data.
 *
 * This is a code-shape test (not a runtime integration test): we read
 * the call-site source files and assert the hardcoded values are gone.
 * It's deliberately literal — if anyone ever re-introduces a fallback
 * with the old wrong values, this test catches it immediately.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Reconstructed from parts so the leaked-value string never appears as a
// contiguous literal in committed source. Intent: still catch any
// re-introduction of the old hardcoded IBAN fallback — without re-leaking it.
const OLD_LEAKED_IBAN = ["DE", "25", "83065408", "0006894453"].join("");

describe("cron beitragsreminder threads VEREIN_* env vars (no hardcoded fallbacks)", () => {
  const src = readFileSync(
    "src/routes/api/cron/beitragsreminder/+server.ts",
    "utf-8",
  );

  it("does not contain the old hardcoded IBAN fallback", () => {
    expect(src).not.toContain(OLD_LEAKED_IBAN);
  });

  it("does not contain the old hardcoded BIC fallback", () => {
    expect(src).not.toMatch(/BELADEBEXXX/);
  });

  it("does not contain the old hardcoded Bankname fallback", () => {
    expect(src).not.toMatch(/Berliner Volksbank|Berliner Sparkasse/);
  });

  it("threads env.VEREIN_IBAN into dispatchBeitragsreminder", () => {
    expect(src).toMatch(/iban:\s*env\.VEREIN_IBAN/);
  });

  it("threads env.VEREIN_BIC into dispatchBeitragsreminder", () => {
    expect(src).toMatch(/bic:\s*env\.VEREIN_BIC/);
  });

  it("threads env.VEREIN_BANK into dispatchBeitragsreminder", () => {
    expect(src).toMatch(/bank:\s*env\.VEREIN_BANK/);
  });

  it("threads env.VEREIN_NAME into dispatchBeitragsreminder", () => {
    expect(src).toMatch(/empfaenger:\s*env\.VEREIN_NAME/);
  });
});

describe("manual send-reminder actions source the bank identity from env only", () => {
  // C2/S3a: the per-route inline `const iban = env.VEREIN_IBAN` reads moved into
  // the shared `vereinBankIdentity()` helper (beitrag-reminder.ts), used by BOTH
  // mitglieder route actions + the Bulk path. The guarantee is unchanged and now
  // single-sourced: env is the only source, and the action refuses when unset.
  const ROUTE_FILES = [
    "src/routes/app/mitglieder/+page.server.ts",
    "src/routes/app/mitglieder/[id]/+page.server.ts",
  ];

  for (const file of ROUTE_FILES) {
    const src = readFileSync(file, "utf-8");

    it(`${file}: no old hardcoded IBAN/BIC/Bankname/Empfänger fallback`, () => {
      expect(src).not.toContain(OLD_LEAKED_IBAN);
      expect(src).not.toMatch(/BELADEBEXXX/);
      expect(src).not.toMatch(/Berliner Volksbank|Berliner Sparkasse/);
      expect(src).not.toMatch(/const\s+empfaenger\s*=\s*["']Folge der Wolke/);
    });

    it(`${file}: sources the bank identity via vereinBankIdentity() + refuses when unset`, () => {
      expect(src).toMatch(/vereinBankIdentity\(\)/);
      // The action bails out (500) when the helper returns null.
      expect(src).toMatch(/if\s*\(\s*!bank\s*\)/);
    });
  }
});

describe("vereinBankIdentity() reads exclusively from env.VEREIN_* (no fallbacks)", () => {
  const src = readFileSync(
    "src/lib/server/domain/beitrag-reminder.ts",
    "utf-8",
  );

  it("does not contain the old hardcoded IBAN/BIC/Bankname fallbacks", () => {
    expect(src).not.toContain(OLD_LEAKED_IBAN);
    expect(src).not.toMatch(/BELADEBEXXX/);
    expect(src).not.toMatch(/Berliner Volksbank|Berliner Sparkasse/);
  });

  it("reads all four VEREIN_* bank fields from env", () => {
    expect(src).toMatch(/env\.VEREIN_IBAN/);
    expect(src).toMatch(/env\.VEREIN_BIC/);
    expect(src).toMatch(/env\.VEREIN_BANK/);
    expect(src).toMatch(/env\.VEREIN_NAME/);
  });

  it("returns null when any bank field is unset (refuse, never send wrong data)", () => {
    expect(src).toMatch(/return null/);
  });
});
