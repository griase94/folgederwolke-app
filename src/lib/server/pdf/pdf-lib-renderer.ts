/**
 * pdf-lib implementation of InvoicePdfRenderer.
 *
 * Phase 10: the renderer delegates entirely to `renderRechnungV2`, the
 * pixel-faithful brand template. The legacy v1 template was deleted at the
 * end of Phase 10.
 *
 * Generates the invoice entirely in-process — no Drive dependency for
 * content. Drive becomes optional convenience storage and the renderer is
 * unaffected if it is unavailable.
 */

import type {
  InvoicePdfRenderer,
  InvoiceRenderInput,
  InvoiceRenderOutput,
} from "./invoice.js";
import { renderRechnungV2, formatDE } from "./templates/rechnung-v2/index.js";

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
      // § 14 Abs. 4 Nr. 6 UStG fallback when neither leistungszeitraum nor
      // leistungsDatum is set on a legacy/snapshot input.
      leistungszeitraum:
        input.leistungszeitraum ??
        (input.leistungsDatum
          ? formatDE(input.leistungsDatum)
          : "Leistungsdatum entspricht Rechnungsdatum"),
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

/** Default renderer used by the domain layer. */
export const pdfLibInvoiceRenderer: InvoicePdfRenderer =
  new PdfLibInvoiceRenderer();
