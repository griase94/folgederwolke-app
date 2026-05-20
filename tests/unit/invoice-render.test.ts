/**
 * @phase-5
 *
 * Unit tests for the pdf-lib invoice renderer + the live preview HTML
 * helper. These tests do NOT hit the database — they exercise the pure
 * rendering layer so a broken template fails fast in CI.
 */

import { describe, it, expect } from "vitest";
import { PdfLibInvoiceRenderer } from "$lib/server/pdf/pdf-lib-renderer.js";
import { renderInvoicePreviewHtml } from "$lib/server/domain/invoices.js";
import type { InvoiceRenderInput } from "$lib/server/pdf/invoice.js";

const FIXTURE: InvoiceRenderInput = {
  invoiceNumber: "FDW-2026-007",
  rechnungsdatum: "2026-05-19",
  leistungsDatum: "2026-05-12",
  faelligkeitsDatum: "2026-06-12",
  verein: {
    name: "Folge der Wolke e.V.",
    adresse: "Westermuehlstrasse 6\n80469 Muenchen",
    steuernummer: "143/215/10028",
    vereinsregister: "VR 211227",
    iban: "DE43830654089999999999",
    bic: "GENODEF1ETK",
    bank: "Bank fuer Kirche und Diakonie",
  },
  customer: {
    name: "Kulturbuero Beispielstadt",
    addressBlock: "Beispielstrasse 12\n12345 Beispielstadt",
  },
  bezeichnung: "Auftritt 12.05.2026",
  leistungsBeschreibung:
    "Musikalische Begleitung der Kulturveranstaltung inkl. Aufbau und Soundcheck. " +
    "Vereinbart per E-Mail vom 03.04.2026.",
  lineItems: [
    {
      beschreibung: "Musikalische Begleitung der Kulturveranstaltung",
      nettoCents: 75000,
    },
  ],
  nettoCents: 75000,
  ustCents: 0,
  bruttoCents: 75000,
  currency: "EUR",
  footerNote:
    "Kein Ausweis der Umsatzsteuer gemaess Paragraph 19 UStG (Kleinunternehmerregelung).",
};

describe("@phase-5 PdfLibInvoiceRenderer", () => {
  it("renders a non-empty PDF buffer", async () => {
    const renderer = new PdfLibInvoiceRenderer();
    const out = await renderer.render(FIXTURE);
    expect(out.mimeType).toBe("application/pdf");
    expect(out.bytes.byteLength).toBeGreaterThan(1000);
    // PDF signature
    const header = String.fromCharCode(
      out.bytes[0]!,
      out.bytes[1]!,
      out.bytes[2]!,
      out.bytes[3]!,
    );
    expect(header).toBe("%PDF");
    expect(out.suggestedFilename).toContain("FDW-2026-007");
  });

  it("renders with optional fields omitted", async () => {
    const renderer = new PdfLibInvoiceRenderer();
    const minimal: InvoiceRenderInput = {
      ...FIXTURE,
      leistungsDatum: null,
      faelligkeitsDatum: null,
      leistungsBeschreibung: null,
      verein: {
        ...FIXTURE.verein,
        iban: undefined,
        bic: undefined,
        bank: undefined,
      },
      customer: {
        name: "Anonyme Kund:in",
        addressBlock: null,
      },
    };
    const out = await renderer.render(minimal);
    expect(out.bytes.byteLength).toBeGreaterThan(500);
  });

  it("renders the live HTML preview with German formatting", () => {
    const html = renderInvoicePreviewHtml({
      bezeichnung: "Auftritt 12.05.2026",
      leistungsBeschreibung: "Beschreibung",
      rechnungsdatum: "2026-05-19",
      leistungsDatum: null,
      faelligkeitsDatum: "2026-06-12",
      customerName: "Kulturbuero",
      customerAddressBlock: "Beispielstrasse 12",
      nettoCents: 12345,
      ustCents: 0,
      bruttoCents: 12345,
      currency: "EUR",
      invoiceNumberPreview: "FDW-2026-007",
      verein: {
        name: "Folge der Wolke e.V.",
        adresse: "Westermuehlstrasse 6",
        steuernummer: "143/215/10028",
        vereinsregister: "VR 211227",
      },
    });
    expect(html).toContain("FDW-2026-007");
    expect(html).toContain("Kulturbuero");
    // 12345 cents = 123,45 €
    expect(html).toMatch(/123,45/);
    expect(html).toContain("19.05.2026");
    expect(html).toContain("12.06.2026");
    expect(html).toContain("Rechnung");
  });

  it("preview HTML escapes user input", () => {
    const html = renderInvoicePreviewHtml({
      bezeichnung: "<script>alert(1)</script>",
      leistungsBeschreibung: null,
      rechnungsdatum: "2026-05-19",
      leistungsDatum: null,
      faelligkeitsDatum: null,
      customerName: 'Bad "Name" & Co',
      customerAddressBlock: null,
      nettoCents: 100,
      ustCents: 0,
      bruttoCents: 100,
      currency: "EUR",
      invoiceNumberPreview: "FDW-2026-001",
      verein: {
        name: "FDW",
        adresse: "",
        steuernummer: "",
        vereinsregister: "",
      },
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;Name&quot;");
  });
});
