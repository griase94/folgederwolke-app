/**
 * pdf-lib implementation of InvoicePdfRenderer.
 *
 * Generates the invoice entirely in-process — no Drive dependency for
 * content. Drive becomes optional convenience storage and the renderer is
 * unaffected if it is unavailable.
 *
 * The renderer is a thin orchestrator on top of `drawInvoice()` from the
 * template module. Callers should use `pdfLibInvoiceRenderer` (singleton)
 * unless they need a separate instance for testing.
 */

import { PDFDocument } from "pdf-lib";
import type {
  InvoicePdfRenderer,
  InvoiceRenderInput,
  InvoiceRenderOutput,
} from "./invoice.js";
import { drawInvoice } from "./templates/invoice-template.js";

export class PdfLibInvoiceRenderer implements InvoicePdfRenderer {
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
