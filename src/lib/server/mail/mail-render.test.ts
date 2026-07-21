// @vitest-environment node
/**
 * @phase-1 @gmail-safe
 *
 * Vitest unit tests for mail template rendering.
 *
 * Each test SSR-renders a template with fixture props and asserts:
 * - HTML contains key German phrases
 * - HTML contains VEREIN_NAME / footer text
 * - Plain-text fallback is non-empty and has key phrases
 * - Rendered HTML uses ONLY mail-client-safe CSS (no oklch, no gradient).
 *   The 2026-05-19 ux + test-coverage reviews flagged 5 templates that
 *   used oklch() + linear-gradient(), both of which Gmail strips, leaving
 *   unreadable headers. The Gmail-safe assertion below runs against every
 *   shipped template so a future template can't regress.
 *
 * No real mail is sent; render.ts is tested in isolation.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderMailTemplate } from "./render.js";
import { subjectFor } from "./index.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// White-label identity props that sendMail() injects into every template
// from readStammdaten() (Task 2.2). The templates render this footer/name —
// never a hardcoded "Folge der Wolke" literal — so the tests assert on the
// VALUE supplied here, proving the identity is prop-driven.
const WL_IDENTITY = {
  vereinName: "Verein X e.V.",
  adresse: "Teststraße 1, 12345 Testort",
  vr: "VR 999",
  steuernummer: "111/222/33333",
};
const VEREIN_NAME = WL_IDENTITY.vereinName;

const eingangsProps = {
  ...WL_IDENTITY,
  baseUrl: "https://app.example.test",
  vorname: "Lea",
  ausId: "AUS-2026-042",
  bezeichnung: "Druckerpapier für Wolkenbüro",
  betragCents: 2350,
  eingereichtAm: new Date("2026-05-15T10:00:00Z"),
};

const erstattungsProps = {
  ...WL_IDENTITY,
  vorname: "Lea",
  ausId: "AUS-2026-042",
  bezeichnung: "Druckerpapier für Wolkenbüro",
  betragCents: 2350,
  verwendungszweck: "AUS-2026-042 Lea Mustermann",
  erstattungsAm: new Date("2026-05-17T12:00:00Z"),
};

const beitragsProps = {
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

const magicLinkProps = {
  ...WL_IDENTITY,
  email: "lea@example.com",
  magicUrl: "https://app.folgederwolke.de/sign-in/verify?token=abc123",
  expiresInMinutes: 15,
};

// InvoiceVersendetMail — the customer-facing "Rechnung versendet" mail. The PDF
// rides along as an attachment, so there is NO download CTA and NO /app/* link.
// The base fixture carries anrede + Fälligkeit + full bank data; variant tests
// below override individual fields to exercise the conditional branches.
const invoiceVersendetProps = {
  ...WL_IDENTITY,
  customerName: "Maria Muster",
  anrede: "Liebe Maria",
  invoiceNumber: "FDW-2026-006",
  bezeichnung: "Kursgebühr Aquarell",
  bruttoCents: 6000,
  currency: "EUR",
  rechnungsdatum: "2026-06-22",
  faelligkeitsDatum: "2026-07-31",
  iban: "DE21 7015 0000 0012 3456 78",
  bic: "SSKMDEMMXXX",
  empfaenger: "Folge der Wolke e.V.",
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
    // Identity is fully prop-driven — no hardcoded FdW literal survives.
    expect(html).not.toContain("Folge der Wolke");
    expect(html).toContain("Hallo");
    // Greeting
    expect(html).toContain("Liebste:r Lea");
    // AUS-ID
    expect(html).toContain("AUS-2026-042");
    // Betrag formatted
    expect(html).toContain("23,50");
    // German phrase
    expect(html).toContain("in Vorkasse gegangen");
    // CTA link — must be an ABSOLUTE URL (relative paths are dead in email
    // clients; Task 2.3). Built from the injected baseUrl (PUBLIC_BASE_URL).
    expect(html).toContain(
      'href="https://app.example.test/auslage-status/AUS-2026-042"',
    );
    expect(html).toMatch(
      /href="https:\/\/[^"]*\/auslage-status\/AUS-2026-042"/,
    );
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
    expect(html).toContain("DE43 8306");
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

// ---------------------------------------------------------------------------
// InvoiceVersendetMail
// ---------------------------------------------------------------------------

describe("InvoiceVersendetMail", () => {
  it("with anrede + Fälligkeit + bank data renders the full mail", async () => {
    const { html } = await renderTemplate(
      "InvoiceVersendetMail",
      invoiceVersendetProps,
    );

    expect(html).toContain(VEREIN_NAME);
    // Personalised greeting uses the verbatim anrede (never "Liebe:r Firmenname").
    // The anrede may be formal Sie, so the intro is register-neutral ("die
    // Rechnung", NOT "deine Rechnung") — no Sie/du collision.
    expect(html).toContain("Liebe Maria,");
    expect(html).toContain("anbei die Rechnung als PDF");
    expect(html).not.toContain("anbei deine Rechnung");
    // Invoice number (also the Verwendungszweck)
    expect(html).toContain("FDW-2026-006");
    // Fälligkeit row rendered when the date is set
    expect(html).toContain("Fällig bis");
    // Bank-transfer block gate satisfied (iban + bic + empfaenger + EUR); the
    // IBAN renders in human-readable 4-char groups.
    expect(html).toContain("IBAN");
    expect(html).toContain("DE21 7015 0000 0012 3456 78");
    // PDF is attached, not linked
    expect(html).toContain("Deine Rechnung hängt als PDF an dieser E-Mail.");
    // The synthesised "Liebe:r" salutation must never appear
    expect(html).not.toContain("Liebe:r");
    // No download CTA / no in-app link — the PDF is an attachment
    expect(html).not.toContain("herunterladen");
    expect(html).not.toContain("/app/");
  });

  it("without anrede falls back to a neutral Hallo! greeting", async () => {
    const { html } = await renderTemplate("InvoiceVersendetMail", {
      ...invoiceVersendetProps,
      anrede: null,
    });

    expect(html).toContain("Hallo! Anbei deine Rechnung als PDF");
    // No "Liebe…" salutation anywhere when anrede is null
    expect(html).not.toContain("Liebe");
  });

  it("omits the Fälligkeit row when faelligkeitsDatum is null", async () => {
    const { html } = await renderTemplate("InvoiceVersendetMail", {
      ...invoiceVersendetProps,
      faelligkeitsDatum: null,
    });

    expect(html).not.toContain("Fällig bis");
    // Sanity: the rest of the mail still renders
    expect(html).toContain("FDW-2026-006");
  });

  it("without bank data shows only the Überweisung hint", async () => {
    const { html } = await renderTemplate("InvoiceVersendetMail", {
      ...invoiceVersendetProps,
      iban: undefined,
      bic: undefined,
      empfaenger: undefined,
    });

    // No bank table above, so the hint names the Verwendungszweck inline
    // (not "oben") and does NOT reference a missing table.
    expect(html).toContain("Bitte per Überweisung mit dem Verwendungszweck");
    expect(html).not.toContain("Verwendungszweck oben");
    // No bank-transfer table without complete bank data
    expect(html).not.toContain("IBAN");
  });

  it("renders the Giro-QR as a CID <img> (not a data-URI) when qrPngCid is set", async () => {
    const { html } = await renderTemplate("InvoiceVersendetMail", {
      ...invoiceVersendetProps,
      qrPngCid: "girocode-FDW-2026-006",
    });
    // CID reference — never a data-URI (mail clients strip those).
    expect(html).toContain('src="cid:girocode-FDW-2026-006"');
    expect(html).not.toContain("data:image");
    // Giro-Code caption + scan instruction.
    expect(html).toContain("Giro-Code");
    expect(html).toContain("QR mit der Banking-App scannen");
    // Image alt carries the payload essentials for image-blocking clients.
    expect(html).toContain("SEPA-Überweisung");
    // The generic Überweisung hint is replaced by the QR block.
    expect(html).not.toContain(
      "Einfach per Überweisung mit dem Verwendungszweck oben",
    );
  });

  it("plain-text fallback is non-empty and has key German text", async () => {
    const { text } = await renderTemplate(
      "InvoiceVersendetMail",
      invoiceVersendetProps,
    );

    expect(text.length).toBeGreaterThan(100);
    expect(text).toContain("FDW-2026-006");
    expect(text).toContain(VEREIN_NAME);
  });
});

// ---------------------------------------------------------------------------
// Gmail-safe CSS regression guard (Round E, 2026-05-19)
// ---------------------------------------------------------------------------
// Scans every *.svelte under templates/ and refuses to ship any that
// references `oklch()` or `linear-gradient(`. Gmail's CSS sanitiser strips
// both and the previous templates ended up with invisible headers / CTAs.
//
// The check operates on the SOURCE files rather than rendered output so it
// fires even when a template is added but no test rendering it exists yet.

describe("mail templates — Gmail-safe CSS sweep", () => {
  it("no template uses oklch() or linear-gradient()", async () => {
    const templateDir = new URL("./templates/", import.meta.url);
    const entries = await readdir(templateDir);
    const svelteFiles = entries.filter((f) => f.endsWith(".svelte"));
    expect(svelteFiles.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of svelteFiles) {
      const source = await readFile(join(templateDir.pathname, file), "utf-8");
      // Strip comment blocks before checking — the MagicLink template
      // intentionally documents "no oklch" in its header comment.
      const stripped = source
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");
      if (/oklch\s*\(/.test(stripped)) {
        offenders.push(`${file}: contains oklch()`);
      }
      if (/linear-gradient\s*\(/.test(stripped)) {
        offenders.push(`${file}: contains linear-gradient()`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// subjectFor — runtime vereinName interpolation (Task 2.2)
// ---------------------------------------------------------------------------
// Every subject must carry the runtime Verein name from props.vereinName,
// never a hardcoded "Folge der Wolke" literal.

describe("subjectFor — name-bearing subjects from props.vereinName", () => {
  const name = "Verein X e.V.";

  it("magic_link subject uses the runtime name", () => {
    const s = subjectFor("magic_link", { vereinName: name });
    expect(s).toContain(name);
    expect(s).not.toContain("Folge der Wolke");
  });

  it("spende_bescheinigung subject uses the runtime name", () => {
    const s = subjectFor("spende_bescheinigung", { vereinName: name });
    expect(s).toContain(name);
    expect(s).not.toContain("Folge der Wolke");
  });

  it("invoice_versendet subject uses the runtime name", () => {
    const s = subjectFor("invoice_versendet", {
      vereinName: name,
      invoiceNumber: "R-2026-001",
    });
    expect(s).toContain(name);
    expect(s).toContain("R-2026-001");
    expect(s).not.toContain("Folge der Wolke");
  });

  it("auslage_approved subject uses the runtime name", () => {
    const s = subjectFor("auslage_approved", {
      vereinName: name,
      ausId: "AUS-2026-042",
    });
    expect(s).toContain(name);
    expect(s).not.toContain("Folge der Wolke");
  });

  it("default subject uses the runtime name", () => {
    // The fallback branch — passed an unknown template name via the loose
    // signature — still names the Verein.
    const s = subjectFor(
      "unknown_template" as never,
      { vereinName: name } as never,
    );
    expect(s).toContain(name);
    expect(s).not.toContain("Folge der Wolke");
  });
});
