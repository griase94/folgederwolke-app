/**
 * @phase-5 / @phase-11
 *
 * Unit tests for the pdf-lib invoice renderer. These tests do NOT hit the
 * database — they exercise the pure rendering layer so a broken template
 * fails fast in CI.
 *
 * The Phase 10 HTML preview helper (renderInvoicePreviewHtml) was deleted
 * in Phase 11; live preview now invokes the real pdf-lib renderer through
 * /api/rechnungen/preview. See tests/unit/invoice-preview-endpoint.test.ts
 * for the endpoint contract.
 */

import { describe, it, expect } from "vitest";
import { PdfLibInvoiceRenderer } from "$lib/server/pdf/pdf-lib-renderer.js";
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
});
