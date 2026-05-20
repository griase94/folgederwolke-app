// @vitest-environment node
/**
 * @phase-1 @overnight-c8
 *
 * Cycle-2 expert review F2 — end-to-end bank-data flow.
 *
 * The cron + manual reminder pull bank details from env.VEREIN_*. This
 * test renders the BeitragsReminder template with those values plumbed
 * through and asserts that the EPC payload, IBAN, BIC, and Bankname all
 * appear in the rendered HTML — proving that env to template wiring is
 * unbroken end to end.
 */

import type { Component } from "svelte";
import { describe, expect, it } from "vitest";
import { env } from "../../src/lib/server/env.js";
import { renderMailTemplate } from "../../src/lib/server/mail/render.js";

// Dynamic import keeps the test in step with mail-render.test.ts (which
// also goes through `import(...).default`) -- renderMailTemplate's
// signature is intentionally typed as the generic Svelte Component, so
// we cast the specifically-typed template module to match.
async function loadBeitragsReminder(): Promise<Component> {
  const mod =
    await import("../../src/lib/server/mail/templates/BeitragsReminder.svelte");
  return mod.default as unknown as Component;
}

describe("BeitragsReminder mail carries env-derived bank data end to end", () => {
  it("renders IBAN, BIC, Bankname from env into the HTML", async () => {
    // .env.test sets these to a consistent Deutsche Skatbank pair.
    const props = {
      vorname: "Lea",
      nachname: "Mustermann",
      jahr: 2026,
      betragCents: 5000,
      iban: env.VEREIN_IBAN,
      bic: env.VEREIN_BIC,
      bank: env.VEREIN_BANK,
      empfaenger: env.VEREIN_NAME,
    };

    // Sanity: env values are non-empty in the test environment, so this
    // test is meaningful (not a tautology).
    expect(env.VEREIN_IBAN).not.toBe("");
    expect(env.VEREIN_BIC).not.toBe("");
    expect(env.VEREIN_BANK).not.toBe("");
    expect(env.VEREIN_NAME).not.toBe("");

    const component = await loadBeitragsReminder();
    const { html } = await renderMailTemplate(component, props);

    // BIC appears verbatim
    expect(html).toContain(env.VEREIN_BIC);
    // Bankname appears verbatim
    expect(html).toContain(env.VEREIN_BANK);
    // IBAN appears in 4-char grouped form -- assert by stripping spaces
    // from the rendered IBAN block (the template adds nbsp/spaces every 4
    // chars for human readability).
    const htmlIbanNormalised = html.replace(/[\s ]/g, "");
    expect(htmlIbanNormalised).toContain(env.VEREIN_IBAN);
  });

  it("EPC payload in the email carries the env BIC, not a stale fallback", async () => {
    const props = {
      vorname: "Lea",
      nachname: "Mustermann",
      jahr: 2026,
      betragCents: 5000,
      iban: env.VEREIN_IBAN,
      bic: env.VEREIN_BIC,
      bank: env.VEREIN_BANK,
      empfaenger: env.VEREIN_NAME,
    };

    const component = await loadBeitragsReminder();
    const { html } = await renderMailTemplate(component, props);

    // The EPC payload is in a <pre> block. Find it and assert line 5
    // (the BIC line) matches env.VEREIN_BIC exactly.
    const preMatch = /<pre[^>]*>([\s\S]*?)<\/pre>/.exec(html);
    expect(preMatch).not.toBeNull();
    const epcPayload = (preMatch?.[1] ?? "").trim();
    const lines = epcPayload.split("\n");
    expect(lines[0]).toBe("BCD");
    expect(lines[1]).toBe("001");
    expect(lines[2]).toBe("1");
    expect(lines[3]).toBe("SCT");
    expect(lines[4]).toBe(env.VEREIN_BIC);
    // Line 6 -- IBAN (compact form)
    expect(lines[6]).toBe(env.VEREIN_IBAN);
  });

  it("env.VEREIN_IBAN/BIC pair satisfies the startup consistency check", async () => {
    // Self-validates the .env.test pair: if anyone changes one without the
    // other in the future, this fails loudly.
    const { assertVereinBankConsistent } =
      await import("../../src/lib/server/env.js");
    expect(() =>
      assertVereinBankConsistent({
        iban: env.VEREIN_IBAN,
        bic: env.VEREIN_BIC,
      }),
    ).not.toThrow();
  });
});
