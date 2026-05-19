// @vitest-environment node
/**
 * @phase-1
 *
 * Vitest unit tests for mail template rendering.
 *
 * Each test SSR-renders a template with fixture props and asserts:
 * - HTML contains key German phrases
 * - HTML contains VEREIN_NAME / footer text
 * - Plain-text fallback is non-empty and has key phrases
 *
 * No real mail is sent; render.ts is tested in isolation.
 */

import { describe, expect, it } from "vitest";
import { renderMailTemplate } from "./render.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VEREIN_NAME = "Folge der Wolke e.V.";

const eingangsProps = {
  vorname: "Lea",
  ausId: "AUS-2026-042",
  bezeichnung: "Druckerpapier für Wolkenbüro",
  betragCents: 2350,
  eingereichtAm: new Date("2026-05-15T10:00:00Z"),
};

const erstattungsProps = {
  vorname: "Lea",
  ausId: "AUS-2026-042",
  bezeichnung: "Druckerpapier für Wolkenbüro",
  betragCents: 2350,
  verwendungszweck: "AUS-2026-042 Lea Mustermann",
  erstattungsAm: new Date("2026-05-17T12:00:00Z"),
};

const beitragsProps = {
  vorname: "Lea",
  nachname: "Mustermann",
  jahr: 2026,
  betragCents: 5000,
  iban: "DE25830654080006894453",
  bic: "SSKMDEMMXXX",
  bank: "Stadtsparkasse München",
  empfaenger: "Folge der Wolke e.V.",
};

const magicLinkProps = {
  email: "lea@example.com",
  magicUrl: "https://app.folgederwolke.de/sign-in/verify?token=abc123",
  expiresInMinutes: 15,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function renderTemplate(name: string, props: Record<string, unknown>) {
  const mod = await import(`./templates/${name}.svelte`);
  return renderMailTemplate(mod.default, props);
}

// ---------------------------------------------------------------------------
// EingangsMail
// ---------------------------------------------------------------------------

describe("EingangsMail", () => {
  it("renders HTML with key content", async () => {
    const { html } = await renderTemplate("EingangsMail", eingangsProps);

    expect(html).toContain(VEREIN_NAME);
    expect(html).toContain("Hallo");
    // Greeting
    expect(html).toContain("Liebste:r Lea");
    // AUS-ID
    expect(html).toContain("AUS-2026-042");
    // Betrag formatted
    expect(html).toContain("23,50");
    // German phrase
    expect(html).toContain("in Vorkasse gegangen");
    // CTA link
    expect(html).toContain("/auslage-status/AUS-2026-042");
    // Closing
    expect(html).toContain("Mit besten Grüßen");
  });

  it("plain-text fallback is non-empty and has key German text", async () => {
    const { text } = await renderTemplate("EingangsMail", eingangsProps);

    expect(text.length).toBeGreaterThan(100);
    expect(text).toContain("Liebste:r Lea");
    expect(text).toContain("AUS-2026-042");
    expect(text).toContain(VEREIN_NAME);
  });
});

// ---------------------------------------------------------------------------
// ErstattungsMail
// ---------------------------------------------------------------------------

describe("ErstattungsMail", () => {
  it("renders HTML with key content", async () => {
    const { html } = await renderTemplate("ErstattungsMail", erstattungsProps);

    expect(html).toContain(VEREIN_NAME);
    expect(html).toContain("Liebste:r Lea");
    expect(html).toContain("AUS-2026-042");
    expect(html).toContain("23,50");
    expect(html).toContain("Erstattung");
    expect(html).toContain("AUS-2026-042 Lea Mustermann");
    expect(html).toContain("Werktagen");
    expect(html).toContain("Mit besten Grüßen");
  });

  it("plain-text fallback is non-empty and has key German text", async () => {
    const { text } = await renderTemplate("ErstattungsMail", erstattungsProps);

    expect(text.length).toBeGreaterThan(100);
    expect(text).toContain("Liebste:r Lea");
    expect(text).toContain("Erstattung");
    expect(text).toContain(VEREIN_NAME);
  });
});

// ---------------------------------------------------------------------------
// BeitragsReminder
// ---------------------------------------------------------------------------

describe("BeitragsReminder", () => {
  it("renders HTML with key content", async () => {
    const { html } = await renderTemplate("BeitragsReminder", beitragsProps);

    expect(html).toContain(VEREIN_NAME);
    expect(html).toContain("Liebste:r Lea");
    expect(html).toContain("2026");
    expect(html).toContain("50,00");
    // IBAN formatted
    expect(html).toContain("DE25 8306");
    // Verwendungszweck
    expect(html).toContain("Mitgliedsbeitrag 2026 Lea Mustermann");
    // Warning about Verwendungszweck
    expect(html).toContain("genau so");
    expect(html).toContain("Mit besten Grüßen");
  });

  it("plain-text fallback is non-empty and has key German text", async () => {
    const { text } = await renderTemplate("BeitragsReminder", beitragsProps);

    expect(text.length).toBeGreaterThan(100);
    expect(text).toContain("Mitgliedsbeitrag");
    expect(text).toContain(VEREIN_NAME);
  });
});

// ---------------------------------------------------------------------------
// MagicLink
// ---------------------------------------------------------------------------

describe("MagicLink", () => {
  it("renders HTML with key content", async () => {
    const { html } = await renderTemplate("MagicLink", magicLinkProps);

    expect(html).toContain(VEREIN_NAME);
    // Headline (rewritten 2026-05-19 to be tighter than "Hallo!…")
    expect(html).toContain("Dein Anmelde-Link");
    // Email is shown in the "Du wurdest aufgefordert…" sentence so the
    // user can spot phishing where the click-through identity doesn't
    // match what they entered
    expect(html).toContain("lea@example.com");
    // The CTA URL must be present and unmodified (no smart-quote escaping)
    expect(html).toContain(
      "https://app.folgederwolke.de/sign-in/verify?token=abc123",
    );
    // Expiry minutes are surfaced (the old template said "15 Minuten",
    // the new one says "{n} Minuten" — assert on the number)
    expect(html).toContain("15");
    // Fallback link section — guards against the link being stripped
    // by Outlook-style aggressive sanitisers
    expect(html).toContain("Funktioniert der Knopf nicht?");
    // Anti-phishing language explaining what the user is about to do
    expect(html).toContain("aufgefordert");
    // No Gmail-stripped CSS slipped back in
    expect(html).not.toContain("oklch(");
    expect(html).not.toContain("linear-gradient(");
  });

  it("plain-text fallback is non-empty and has key German text", async () => {
    const { text } = await renderTemplate("MagicLink", magicLinkProps);

    expect(text.length).toBeGreaterThan(50);
    expect(text).toContain("lea@example.com");
    expect(text).toContain(VEREIN_NAME);
  });
});
