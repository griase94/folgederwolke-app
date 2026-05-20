// @vitest-environment node
/**
 * @phase-1 @overnight-c8
 *
 * Cycle-2 expert review F2 — cron + manual-reminder bank data threading.
 *
 * BEFORE: both call sites contained string-literal fallbacks for IBAN,
 * BIC, Bankname, and Empfänger. When VEREIN_* env vars were unset (which
 * was the case for all dev/test envs), reminders went out with hardcoded
 * placeholder values — and the placeholder IBAN encoded Sparkasse
 * Mittelthüringen but the placeholder BIC was Berliner Sparkasse's, so
 * the data was outright wrong, not just stale.
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

describe("manual /mitglieder/[id] send-reminder action threads VEREIN_* env vars", () => {
  const src = readFileSync(
    "src/routes/app/mitglieder/[id]/+page.server.ts",
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

  it("does not contain the old hardcoded Empfänger fallback", () => {
    // The old code had `const empfaenger = "Folge der Wolke e.V."`.
    // env.VEREIN_NAME is the source of truth now.
    expect(src).not.toMatch(/const\s+empfaenger\s*=\s*["']Folge der Wolke/);
  });

  it("reads iban from env.VEREIN_IBAN", () => {
    expect(src).toMatch(/iban\s*=\s*env\.VEREIN_IBAN/);
  });

  it("reads bic from env.VEREIN_BIC", () => {
    expect(src).toMatch(/bic\s*=\s*env\.VEREIN_BIC/);
  });
});
