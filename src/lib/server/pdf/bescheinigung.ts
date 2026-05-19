/**
 * BescheinigungPdfRenderer - pdf-lib implementation.
 *
 * Generates a Zuwendungsbestaetigung PDF entirely in-process from a
 * `BmfPflichtfelder` snapshot produced by the spenden domain layer. The
 * renderer is a thin orchestrator on top of `drawBescheinigung()` from the
 * template module - mirrors the InvoicePdfRenderer split.
 */

import { PDFDocument } from "pdf-lib";
import type { BmfPflichtfelder } from "$lib/server/domain/spenden.js";
import { drawBescheinigung } from "./templates/bescheinigung-template.js";

export interface BescheinigungRenderOutput {
  bytes: Uint8Array;
  suggestedFilename: string;
  mimeType: "application/pdf";
}

export interface BescheinigungPdfRenderer {
  render(input: BmfPflichtfelder): Promise<BescheinigungRenderOutput>;
}

export class PdfLibBescheinigungRenderer implements BescheinigungPdfRenderer {
  async render(p: BmfPflichtfelder): Promise<BescheinigungRenderOutput> {
    const doc = await PDFDocument.create();
    doc.setTitle(`Zuwendungsbestaetigung ${p.bescheinigungNr}`);
    doc.setSubject(`Bescheinigung ueber ${p.spendeKind} vom ${p.spendeDatum}`);
    doc.setAuthor(p.vereinName);
    doc.setProducer("folgederwolke-app");
    doc.setCreationDate(new Date());

    await drawBescheinigung(doc, p);

    const bytes = await doc.save();
    return {
      bytes,
      suggestedFilename: `Zuwendungsbestaetigung_${p.bescheinigungNr}.pdf`,
      mimeType: "application/pdf",
    };
  }
}

/** Default renderer used by the domain + route layer. */
export const pdfLibBescheinigungRenderer: BescheinigungPdfRenderer =
  new PdfLibBescheinigungRenderer();
