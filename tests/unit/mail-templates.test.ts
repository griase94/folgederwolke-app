// @vitest-environment node
/**
 * @phase-1 @overnight-c8
 *
 * Component-level mail-template tests for the C8 re-skin.
 *
 * The MagicLink.svelte template established the "brand strip" pattern:
 * a flat BRAND_PRIMARY_STRONG top bar (no gradient, no playful subtitle) containing
 * the Verein name in white, uppercase, letter-spaced 1.2px, weight 600.
 * Five templates (EingangsMail, ErstattungsMail, RejectionMail,
 * BeitragsReminder, InvoiceVersendetMail) must adopt that same strip.
 *
 * UI-031 (ui-designer review 2026-05-19, §3.13) called the old gradient
 * headers + "Liebesbrief"-subtitle inconsistent; this test guards the
 * re-skin from regressing.
 *
 * PM-024 (pwa-mobile review 2026-05-19, §6) asked for EPC 069 Giro-QR
 * codes in payment mails — BeitragsReminder + InvoiceVersendetMail must
 * embed the EPC 069 payload (text form is OK while a QR-encoding lib
 * is not yet approved).
 */

import { describe, expect, it } from "vitest";
import { renderMailTemplate } from "../../src/lib/server/mail/render.js";
import { BRAND_PRIMARY_STRONG } from "../../src/lib/brand.js";

// White-label identity props that sendMail() injects into every template
// from readStammdaten() (Task 2.2). Rendered directly here, so each fixture
// supplies them explicitly; the brand strip + footer render this VALUE, never
// a hardcoded "Folge der Wolke" literal.
const WL_IDENTITY = {
  vereinName: "Verein X e.V.",
  adresse: "Teststraße 1, 12345 Testort",
  vr: "VR 999",
  steuernummer: "111/222/33333",
};
const VEREIN_NAME = WL_IDENTITY.vereinName;

async function renderTemplate(name: string, props: Record<string, unknown>) {
  const mod = await import(
    `../../src/lib/server/mail/templates/${name}.svelte`
  );
  return renderMailTemplate(mod.default, props);
}

// ---------------------------------------------------------------------------
// Brand-strip detector
// ---------------------------------------------------------------------------
//
// We assert on the *visual* shape MagicLink established, not on a CSS class
// (the templates use inline styles for mail-client compatibility):
//   - solid BRAND_PRIMARY_STRONG background (Aurora: #d6116f)
//   - uppercase
//   - letter-spacing ~1.2px
//   - text-transform:uppercase
//   - contains the runtime Verein name (now prop-driven via vereinName —
//     Task 2.2; the strip renders WL_IDENTITY.vereinName, not a hardcoded
//     "Folge der Wolke" literal).
//
// Also enforce the "no gradient header / no playful subtitle in header" rule.

function expectBrandStrip(html: string) {
  // Flat brand bar (no gradient). Aurora: BRAND_PRIMARY_STRONG (#d6116f).
  expect(html).toContain(`background:${BRAND_PRIMARY_STRONG}`);
  // Uppercased + tight letter-spacing.
  expect(html).toMatch(/text-transform:uppercase/i);
  expect(html).toMatch(/letter-spacing:1\.2px/i);
  // Verein name appears in strip (white text).
  expect(html).toMatch(/color:#ffffff/i);
  expect(html).toContain(VEREIN_NAME);
  // White-label: the de-branded strip must never render the old FdW literal.
  expect(html).not.toContain("Folge der Wolke");
  // No gradient — Gmail strips it (regression guard from Round E).
  expect(html).not.toMatch(/linear-gradient/);
  // No "Liebesbrief" subtitle in the brand strip — moved to body per UI-031.
  // (We don't ban the word everywhere; just assert the header is the clean
  // MagicLink style — color:#FBCFE8 was the old playful subtitle color.)
  expect(html).not.toMatch(/color:#FBCFE8/i);
}

// ---------------------------------------------------------------------------
// EingangsMail
// ---------------------------------------------------------------------------

describe("EingangsMail — brand strip + content", () => {
  const props = {
    ...WL_IDENTITY,
    vorname: "Lea",
    ausId: "AUS-2026-042",
    bezeichnung: "Druckerpapier für Wolkenbüro",
    betragCents: 2350,
    eingereichtAm: new Date("2026-05-15T10:00:00Z"),
  };

  it("uses the brand-strip pattern", async () => {
    const { html } = await renderTemplate("EingangsMail", props);
    expectBrandStrip(html);
  });

  it("renders body content (greeting, AUS-ID, Betrag, CTA)", async () => {
    const { html } = await renderTemplate("EingangsMail", props);
    expect(html).toContain("Liebste:r Lea");
    expect(html).toContain("AUS-2026-042");
    expect(html).toContain("23,50");
    expect(html).toContain("/auslage-status/AUS-2026-042");
    expect(html).toContain("Mit besten Grüßen");
  });
});

// ---------------------------------------------------------------------------
// ErstattungsMail
// ---------------------------------------------------------------------------

describe("ErstattungsMail — brand strip + content", () => {
  const props = {
    ...WL_IDENTITY,
    vorname: "Lea",
    ausId: "AUS-2026-042",
    bezeichnung: "Druckerpapier für Wolkenbüro",
    betragCents: 2350,
    verwendungszweck: "AUS-2026-042 Lea Mustermann",
    erstattungsAm: new Date("2026-05-17T12:00:00Z"),
  };

  it("uses the brand-strip pattern", async () => {
    const { html } = await renderTemplate("ErstattungsMail", props);
    expectBrandStrip(html);
  });

  it("renders body content (AUS-ID, Betrag, Verwendungszweck, Werktage)", async () => {
    const { html } = await renderTemplate("ErstattungsMail", props);
    expect(html).toContain("Liebste:r Lea");
    expect(html).toContain("AUS-2026-042");
    expect(html).toContain("23,50");
    expect(html).toContain("AUS-2026-042 Lea Mustermann");
    expect(html).toContain("Werktagen");
  });
});

// ---------------------------------------------------------------------------
// RejectionMail
// ---------------------------------------------------------------------------

describe("RejectionMail — brand strip + content", () => {
  const props = {
    ...WL_IDENTITY,
    vorname: "Lea",
    ausId: "AUS-2026-042",
    bezeichnung: "Druckerpapier für Wolkenbüro",
    betragCents: 2350,
    grund: "Beleg fehlt – bitte Quittung als PDF nachreichen.",
    abgelehntAm: new Date("2026-05-18T09:00:00Z"),
  };

  it("uses the brand-strip pattern", async () => {
    const { html } = await renderTemplate("RejectionMail", props);
    expectBrandStrip(html);
  });

  it("renders rejection content (greeting, AUS-ID, Grund, gentle wording)", async () => {
    const { html } = await renderTemplate("RejectionMail", props);
    expect(html).toContain("Liebste:r Lea");
    expect(html).toContain("AUS-2026-042");
    expect(html).toContain("Beleg fehlt");
    // Gentle wording — keeps the door open for resubmission.
    expect(html).toMatch(/(noch einmal|erneut|korrigiert)/i);
  });
});

// ---------------------------------------------------------------------------
// BeitragsReminder + Giro-QR
// ---------------------------------------------------------------------------

describe("BeitragsReminder — brand strip + content + Giro-QR", () => {
  const props = {
    ...WL_IDENTITY,
    vorname: "Lea",
    nachname: "Mustermann",
    jahr: 2026,
    betragCents: 5000,
    iban: "DE43830654089999999999",
    bic: "SSKMDEMMXXX",
    bank: "Stadtsparkasse München",
    empfaenger: "Verein X e.V.",
  };

  it("uses the brand-strip pattern", async () => {
    const { html } = await renderTemplate("BeitragsReminder", props);
    expectBrandStrip(html);
  });

  it("renders payment content (IBAN formatted, Verwendungszweck, Betrag)", async () => {
    const { html } = await renderTemplate("BeitragsReminder", props);
    expect(html).toContain("Liebste:r Lea");
    expect(html).toContain("2026");
    expect(html).toContain("50,00");
    expect(html).toContain("DE43 8306");
    expect(html).toContain("Mitgliedsbeitrag 2026 Lea Mustermann");
  });

  it("embeds the EPC 069 Giro-QR payload as a <pre> block", async () => {
    const { html, text } = await renderTemplate("BeitragsReminder", props);
    // EPC 069 service tag — every payload starts with literal "BCD".
    expect(html).toMatch(/<pre[^>]*>[\s\S]*BCD\s*\n001\s*\n1\s*\nSCT/);
    // BIC + IBAN appear inside the payload.
    expect(html).toMatch(/SSKMDEMMXXX/);
    expect(html).toMatch(/DE43830654089999999999/);
    // Amount formatted as EUR50.00 (no thousands separators, dot decimal).
    expect(html).toMatch(/EUR50\.00/);
    // Verwendungszweck (unstructured remittance — last non-empty line).
    expect(html).toContain("Mitgliedsbeitrag 2026 Lea Mustermann");
    // Plain-text fallback also carries the payload (Banking-Apps don't
    // render HTML, but a tech-savvy member could copy-paste).
    expect(text).toContain("BCD");
    expect(text).toContain("SCT");
  });
});

// ---------------------------------------------------------------------------
// InvoiceVersendetMail + Giro-QR
// ---------------------------------------------------------------------------

describe("InvoiceVersendetMail — brand strip + content + Giro-QR", () => {
  const propsWithIban = {
    ...WL_IDENTITY,
    customerName: "Max Mustermann GmbH",
    invoiceNumber: "RE-2026-007",
    bezeichnung: "Workshop Cloudchoreographie",
    bruttoCents: 119000,
    currency: "EUR",
    rechnungsdatum: "2026-05-15",
    faelligkeitsDatum: "2026-06-14",
    downloadUrl: "https://app.folgederwolke.de/invoices/RE-2026-007.pdf",
    iban: "DE43830654089999999999",
    bic: "SSKMDEMMXXX",
    empfaenger: "Verein X e.V.",
  };

  it("uses the brand-strip pattern", async () => {
    const { html } = await renderTemplate(
      "InvoiceVersendetMail",
      propsWithIban,
    );
    expectBrandStrip(html);
  });

  it("renders invoice content (number, Betrag, Fälligkeit, download)", async () => {
    const { html } = await renderTemplate(
      "InvoiceVersendetMail",
      propsWithIban,
    );
    expect(html).toContain("Max Mustermann GmbH");
    expect(html).toContain("RE-2026-007");
    expect(html).toContain("1.190,00");
    expect(html).toContain("15.05.2026");
    expect(html).toContain("14.06.2026");
    expect(html).toContain(
      "https://app.folgederwolke.de/invoices/RE-2026-007.pdf",
    );
  });

  it("embeds the EPC 069 Giro-QR payload when iban + empfaenger present", async () => {
    const { html } = await renderTemplate(
      "InvoiceVersendetMail",
      propsWithIban,
    );
    expect(html).toMatch(/<pre[^>]*>[\s\S]*BCD\s*\n001\s*\n1\s*\nSCT/);
    expect(html).toMatch(/EUR1190\.00/);
    // Verwendungszweck = invoice number
    expect(html).toContain("RE-2026-007");
  });
});
