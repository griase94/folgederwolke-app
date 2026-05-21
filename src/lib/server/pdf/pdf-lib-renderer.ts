/**
 * pdf-lib implementation of InvoicePdfRenderer.
 *
 * Phase 10: the default renderer is now `renderRechnungV2` (the
 * pixel-faithful brand template). The legacy v1 `drawInvoice` template is
 * kept importable until the Task 11 cleanup so other call sites (and any
 * future parallel-rendering regression test) can still reach it.
 *
 * Generates the invoice entirely in-process — no Drive dependency for
 * content. Drive becomes optional convenience storage and the renderer is
 * unaffected if it is unavailable.
 */

import { PDFDocument } from "pdf-lib";
import type {
  InvoicePdfRenderer,
  InvoiceRenderInput,
  InvoiceRenderOutput,
} from "./invoice.js";
import { drawInvoice } from "./templates/invoice-template.js";
import { renderRechnungV2 } from "./templates/rechnung-v2/index.js";

function adresseLines(adresse: string): { line1: string; line2: string } {
  const lines = (adresse ?? "")
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean);
  return { line1: lines[0] ?? "", line2: lines[1] ?? "" };
}

function adresseSingleLine(adresse: string): string {
  return (adresse ?? "")
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" - ");
}

/**
 * Default renderer — Rechnung v2 (brand template).
 */
export class PdfLibInvoiceRenderer implements InvoicePdfRenderer {
  async render(input: InvoiceRenderInput): Promise<InvoiceRenderOutput> {
    const { line1, line2 } = adresseLines(input.verein.adresse);
    const single = adresseSingleLine(input.verein.adresse);
    const bytes = await renderRechnungV2({
      verein: {
        name: input.verein.name,
        adresseSingleLine: single,
        adresseLine1: line1,
        adresseLine2: line2,
        vereinsregister: input.verein.vereinsregister,
        steuernummer: input.verein.steuernummer,
        kontaktPerson: input.verein.kontaktPerson ?? "",
        contactPhone: input.verein.contactPhone ?? "",
        contactEmail: input.verein.contactEmail ?? "",
        bankname: input.verein.bank ?? "",
        iban: input.verein.iban ?? "",
        bic: input.verein.bic ?? "",
      },
      customer: {
        name: input.customer.name,
        addressBlock: input.customer.addressBlock ?? "",
        country: input.customer.country ?? "DE",
      },
      rechnungsnummer: input.invoiceNumber,
      rechnungsdatum: input.rechnungsdatum,
      leistungszeitraum: input.leistungszeitraum ?? null,
      bezeichnung: input.bezeichnung,
      leistungsBeschreibung: input.leistungsBeschreibung ?? null,
      nettoCents: input.nettoCents,
      kassenwaertName: input.kassenwaertName ?? "Julia Schwarz",
    });
    return {
      bytes,
      suggestedFilename: `Rechnung_${input.invoiceNumber}.pdf`,
      mimeType: "application/pdf",
    };
  }
}

/**
 * Legacy v1 renderer (pre-Phase-10 rosa template).
 * Kept importable until Task 11 cleanup. Do not use for new code.
 */
export class PdfLibInvoiceRendererV1 implements InvoicePdfRenderer {
  async render(input: InvoiceRenderInput): Promise<InvoiceRenderOutput> {
    const doc = await PDFDocument.create();
    doc.setTitle(`Rechnung ${input.invoiceNumber}`);
    doc.setSubject(`Rechnung an ${input.customer.name}`);
    doc.setAuthor(input.verein.name);
    doc.setProducer("folgederwolke-app");
    doc.setCreationDate(new Date());

    await drawInvoice(doc, input);

    const bytes = await doc.save();
    return {
      bytes,
      suggestedFilename: `Rechnung_${input.invoiceNumber}.pdf`,
      mimeType: "application/pdf",
    };
  }
}

/** Default renderer used by the domain layer. */
export const pdfLibInvoiceRenderer: InvoicePdfRenderer =
  new PdfLibInvoiceRenderer();

/** Legacy v1 instance — kept until Task 11. */
export const pdfLibInvoiceRendererV1: InvoicePdfRenderer =
  new PdfLibInvoiceRendererV1();
