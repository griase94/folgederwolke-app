// @vitest-environment node
/**
 * @phase-9
 *
 * The three Auslagen decision mails as ONE suite (A-S3.3):
 * ApprovalMail · RejectionMail · ErstattungsMail.
 *
 * Briefs: mail-auslage-approved.md, mail-auslage-abgelehnt.md,
 * mail-auslage-erstattet.md — each §7 is an acceptance list, and this file is
 * that list. Beyond per-mail copy it pins the properties that only exist
 * BETWEEN the three (they are the reason the suite feels like one system):
 *
 *   · plum owns the money digit, emerald only ever the chrome,
 *   · the emerald card exists exactly once in the whole suite,
 *   · the amount is the largest element of its mail,
 *   · one sign-off spelling, one footer, no cold Tailwind grays.
 *
 * Mail-client constraints (solid hex, table layout, no webfont) are asserted
 * per mail, because a single `var(--…)` slipping in is invisible locally and
 * broken in every inbox.
 */

import { describe, expect, it } from "vitest";
import { renderMailTemplate } from "../../src/lib/server/mail/render.js";
import { subjectFor } from "../../src/lib/server/mail/index.js";
import {
  EMERALD,
  EMERALD_TEXT,
  PAID_BG,
  PLUM,
} from "../../src/lib/server/mail/templates/kit/tokens.js";

const WL_IDENTITY = {
  vereinName: "Verein X e.V.",
  adresse: "Teststraße 1, 12345 Testort",
  vr: "VR 999",
  steuernummer: "111/222/33333",
};

async function renderTemplate(name: string, props: Record<string, unknown>) {
  const mod = await import(
    `../../src/lib/server/mail/templates/${name}.svelte`
  );
  return renderMailTemplate(mod.default, props);
}

const approvalProps = {
  ...WL_IDENTITY,
  vorname: "Sabine",
  ausId: "AUS-2026-0033",
  bezeichnung: "Kuchen & Kaffee Elternabend",
  betragCents: 3640,
  kategorie: "Vereinsfeste & Aktionen",
  sphaere: "Zweckbetrieb",
  decidedAt: "2026-07-09T12:00:00Z",
};

const rejectionProps = {
  ...WL_IDENTITY,
  vorname: "Stefan",
  ausId: "AUS-2026-0037",
  bezeichnung: "Tankquittung Vereinsbus",
  betragCents: 7230,
  grund:
    "Der Beleg war leider nicht lesbar — Betrag und Datum ließen sich auf dem Foto nicht erkennen. Mach bitte ein schärferes Foto, dann geht's sofort durch.",
  abgelehntAm: new Date("2026-07-09T12:00:00Z"),
  eingereichtAm: new Date("2026-07-08T09:30:00Z"),
  baseUrl: "https://folgederwolke.example/",
};

const erstattetProps = {
  ...WL_IDENTITY,
  vorname: "Thomas",
  ausId: "AUS-2026-0034",
  bezeichnung: "Noten für den Chor",
  betragCents: 6400,
  verwendungszweck: "Erstattung AUS-2026-0034 Verein X e.V.",
  erstattungsAm: new Date("2026-07-11T12:00:00Z"),
};

/** de-DE renders a NBSP before the € — a plain space means broken formatting. */
const NBSP_EUR = " €";

/**
 * Mail-client safety, asserted on the rendered document rather than by reading
 * the template: everything a client strips (custom properties, oklch, gradients,
 * remote fonts) must be absent, and the layout must be table-based.
 */
function expectMailSafe(html: string) {
  expect(html).not.toMatch(/var\(--/);
  expect(html).not.toMatch(/oklch\(/);
  expect(html).not.toMatch(/linear-gradient\(/);
  expect(html).not.toMatch(/@import|fonts\.googleapis|@font-face/);
  expect(html).toMatch(/<table[^>]+role="presentation"/);
}

/** Largest font-size in px anywhere in the document. */
function maxFontSize(html: string): number {
  const sizes = [...html.matchAll(/font-size:([\d.]+)px/g)].map((m) =>
    Number(m[1]),
  );
  return Math.max(...sizes);
}

// ---------------------------------------------------------------------------
// ApprovalMail
// ---------------------------------------------------------------------------

describe("ApprovalMail — genehmigt", () => {
  it("leads with the state and the amount in the subject", () => {
    expect(subjectFor("auslage_approved", approvalProps)).toBe(
      "Genehmigt (36,40 €): Deine Auslage AUS-2026-0033 ist durch",
    );
  });

  it("renders chip, headline and the emerald-accented amount hero", async () => {
    const { html } = await renderTemplate("ApprovalMail", approvalProps);
    expectMailSafe(html);
    expect(html).toContain("Genehmigt");
    expect(html).toContain("Deine Auslage ist durch");
    expect(html).toContain("Genehmigter Betrag");
    expect(html).toContain(`36,40${NBSP_EUR}`);
    // Emerald may accent the hero; the digit itself stays plum.
    expect(html).toContain(`border-top:4px solid ${EMERALD}`);
    expect(html).toMatch(
      new RegExp(`font-size:34px;font-weight:800;color:${PLUM}`),
    );
  });

  it("shows the fact block as AUS-Nr. (mono) / Kategorie · Sphäre / Genehmigt am", async () => {
    const { html } = await renderTemplate("ApprovalMail", approvalProps);
    expect(html).toContain("AUS-Nr.");
    expect(html).toContain("AUS-2026-0033");
    expect(html).toMatch(/SFMono-Regular/);
    expect(html).toContain("Vereinsfeste &amp; Aktionen · Zweckbetrieb");
    expect(html).toContain("Genehmigt am");
    expect(html).toContain("09.07.2026");
  });

  it("promises the SECOND mail with 'überwiesen' and never says 'angewiesen'", async () => {
    const { html, text } = await renderTemplate("ApprovalMail", approvalProps);
    expect(html).toContain("Wie es weitergeht");
    expect(html).toContain("überwiesen");
    // "angewiesen" is bank-speak nobody outside a treasury uses (Abnahme #14).
    expect(html).not.toContain("angewiesen");
    expect(text).not.toContain("angewiesen");
  });

  it("has no CTA button at all — there is nothing to do", async () => {
    const { html } = await renderTemplate("ApprovalMail", approvalProps);
    expect(html).not.toMatch(/<a\s/);
    expect(html).toContain("Antworte einfach auf diese E-Mail");
  });

  it("makes the amount the largest element of the mail", async () => {
    const { html } = await renderTemplate("ApprovalMail", approvalProps);
    expect(maxFontSize(html)).toBe(34);
  });
});

// ---------------------------------------------------------------------------
// RejectionMail
// ---------------------------------------------------------------------------

describe("RejectionMail — Korrektur nötig", () => {
  it("frames the subject as solvable, not ominous", () => {
    expect(subjectFor("auslage_abgelehnt", rejectionProps)).toBe(
      "Kurz zu deiner Auslage AUS-2026-0037 — so klappt's mit der Erstattung",
    );
  });

  it("keeps the chip neutral — a rejection is not an alarm", async () => {
    const { html } = await renderTemplate("RejectionMail", rejectionProps);
    expectMailSafe(html);
    expect(html).toContain("Korrektur nötig");
    // No sev-critical red anywhere; amber is the suite's only warn colour.
    expect(html).not.toMatch(/#dc2626|#b91c1c|#ef4444/i);
    expect(html).toContain("#e39412");
  });

  it("renders the reason verbatim, including line breaks", async () => {
    const multiline = {
      ...rejectionProps,
      grund: "Zeile eins.\nZeile zwei mit Detail.",
    };
    const { html } = await renderTemplate("RejectionMail", multiline);
    expect(html).toContain("Woran’s liegt");
    expect(html).toContain("Zeile eins.\nZeile zwei mit Detail.");
    // pre-line is what keeps the treasurer's paragraph breaks alive.
    expect(html).toMatch(/white-space:pre-line/);
  });

  it("does not truncate a long reason", async () => {
    const long = "Sehr ausführlich begründet. ".repeat(30).trim();
    const { html } = await renderTemplate("RejectionMail", {
      ...rejectionProps,
      grund: long,
    });
    expect(html).toContain(long);
  });

  it("dates the SUBMISSION, not the decision", async () => {
    const { html } = await renderTemplate("RejectionMail", rejectionProps);
    expect(html).toContain("Eingereicht am");
    expect(html).toContain("08.07.2026");
    expect(html).not.toContain("09.07.2026");
  });

  it("offers exactly one CTA, absolute and built from PUBLIC_BASE_URL", async () => {
    const { html } = await renderTemplate("RejectionMail", rejectionProps);
    const links = [...html.matchAll(/<a\s/g)];
    expect(links).toHaveLength(1);
    expect(html).toContain(
      'href="https://folgederwolke.example/auslage-einreichen"',
    );
    expect(html).toContain("Auslage neu einreichen");
  });

  it("stays warm in the frame while the reason stays sober", async () => {
    const { html } = await renderTemplate("RejectionMail", rejectionProps);
    expect(html).toContain("noch nicht erstatten");
    expect(html).toContain("Kein Drama");
    // Never blame the member for the rejection.
    expect(html).not.toMatch(/leider musst du|dein Fehler|falsch gemacht/i);
  });
});

// ---------------------------------------------------------------------------
// ErstattungsMail
// ---------------------------------------------------------------------------

describe("ErstattungsMail — überwiesen", () => {
  it("leads the subject with the amount", () => {
    expect(subjectFor("auslage_erstattet", erstattetProps)).toBe(
      "Überwiesen (64,00 €): Deine Erstattung ist raus",
    );
  });

  it("renders the paid card with a plum amount on emerald chrome", async () => {
    const { html } = await renderTemplate("ErstattungsMail", erstattetProps);
    expectMailSafe(html);
    expect(html).toContain("Deine Erstattung ist raus");
    expect(html).toContain("Vorkasse-Modus aus, Wolken-Modus an");
    expect(html).toContain(`background:${PAID_BG}`);
    expect(html).toContain(`color:${EMERALD_TEXT}`);
    expect(html).toMatch(
      new RegExp(`font-size:32px;font-weight:800;color:${PLUM}`),
    );
    expect(html).toContain(`64,00${NBSP_EUR}`);
    expect(maxFontSize(html)).toBe(32);
  });

  it("lists Überwiesen am / Auslage / AUS-Nr. / Verwendungszweck", async () => {
    const { html } = await renderTemplate("ErstattungsMail", erstattetProps);
    expect(html).toContain("Überwiesen am 11.07.2026");
    expect(html).toContain("Noten für den Chor");
    expect(html).toContain("Verwendungszweck");
    expect(html).toContain("Erstattung ");
  });

  it("keeps the AUS-Nr. inside the Verwendungszweck unbreakable", async () => {
    const { html } = await renderTemplate("ErstattungsMail", erstattetProps);
    expect(html).toContain(
      '<span style="white-space:nowrap;">AUS-2026-0034</span>',
    );
  });

  it("names the 1–3 Werktage and thanks, without any CTA", async () => {
    const { html } = await renderTemplate("ErstattungsMail", erstattetProps);
    expect(html).toContain("1–3 Werktagen");
    expect(html).toContain("Tausend Dank");
    expect(html).not.toMatch(/<a\s/);
  });
});

// ---------------------------------------------------------------------------
// Suite-level properties — the things that only exist BETWEEN the three mails
// ---------------------------------------------------------------------------

describe("decision-mail suite", () => {
  async function renderAll() {
    return {
      approval: (await renderTemplate("ApprovalMail", approvalProps)).html,
      rejection: (await renderTemplate("RejectionMail", rejectionProps)).html,
      erstattet: (await renderTemplate("ErstattungsMail", erstattetProps)).html,
    };
  }

  it("uses ONE sign-off, spelled Gschaftler", async () => {
    const all = await renderAll();
    for (const html of Object.values(all)) {
      expect(html).toContain("Liebe Grüße");
      expect(html).toContain("die Finanz-Gschaftler:innen");
      expect(html).not.toContain("Geschäftler");
      // The sign-off is the short form — no Verein-name noun stack.
      expect(html).not.toContain("deine Verein X e.V. Finanz");
    }
  });

  it("renders the Verein identity from runtime props, never a literal", async () => {
    const all = await renderAll();
    for (const html of Object.values(all)) {
      expect(html).toContain("Verein X e.V.");
      expect(html).toContain("VR 999");
      expect(html).not.toContain("Folge der Wolke");
    }
  });

  it("puts the green detail card in the Erstattungs-Mail and nowhere else", async () => {
    const all = await renderAll();
    expect(all.erstattet).toContain(PAID_BG);
    expect(all.approval).not.toContain(PAID_BG);
    expect(all.rejection).not.toContain(PAID_BG);
  });

  it("never colours a money digit anything but plum", async () => {
    const all = await renderAll();
    for (const html of Object.values(all)) {
      // Every amount-styled cell/hero carries the plum colour…
      expect(html).toContain(PLUM);
      // …and no EUR value is ever emerald or pink.
      expect(html).not.toMatch(
        new RegExp(`color:(${EMERALD}|#d6116f)[^"]*">[^<]*€`, "i"),
      );
    }
  });

  it("drops the cold Tailwind grays from the shared footer", async () => {
    const all = await renderAll();
    for (const html of Object.values(all)) {
      expect(html).not.toMatch(/#9ca3af|#6b7280|#374151|#111827|#1f2937/i);
    }
  });

  it("keeps the responsive stylesheet out of the plain-text part", async () => {
    const { text } = await renderTemplate("ApprovalMail", approvalProps);
    expect(text).not.toContain("fdw-k");
    expect(text).not.toContain("@media");
    expect(text).toContain("Deine Auslage ist durch");
  });

  it("ships the label/value stacking hooks the mobile rule needs", async () => {
    const all = await renderAll();
    for (const html of Object.values(all)) {
      expect(html).toContain('class="fdw-k"');
      expect(html).toContain('class="fdw-v"');
      expect(html).toMatch(/@media only screen and \(max-width:480px\)/);
    }
  });
});
