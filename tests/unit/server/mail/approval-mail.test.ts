// @vitest-environment node
/**
 * @phase-9
 * Unit test for ApprovalMail template rendering.
 */
import { describe, it, expect } from "vitest";
import type { Component } from "svelte";
import { renderMailTemplate } from "$lib/server/mail/render.js";

describe("ApprovalMail template", () => {
  it("renders subject + body with German formatting", async () => {
    const mod = await import("$lib/server/mail/templates/ApprovalMail.svelte");
    // mod.default has narrower Props than renderMailTemplate's loose
    // `Component<{}>` signature — match the casting pattern used in mail/index.ts.
    const out = renderMailTemplate(mod.default as unknown as Component, {
      vorname: "Max",
      ausId: "AUS-2026-007",
      bezeichnung: "Druckerpapier",
      betragCents: 1599,
      kategorie: "Büromaterial",
      decidedAt: "2026-05-22T03:00:00+02:00",
    });

    // Subject is composed by subjectFor() in mail/index.ts — template itself
    // renders HTML + text. Assert on rendered content.
    expect(out.html).toContain("AUS-2026-007");
    expect(out.html).toContain("genehmigt");
    expect(out.html).toContain("15,99");
    expect(out.html).toContain("Max");
    expect(out.html).toContain("Druckerpapier");
    expect(out.html).toContain("Büromaterial");
  });
});
