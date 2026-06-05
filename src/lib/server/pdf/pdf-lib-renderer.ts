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
import { addressLines, addressOneLine } from "$lib/server/domain/address.js";

export class PdfLibInvoiceRenderer implements InvoicePdfRenderer {
  async render(input: InvoiceRenderInput): Promise<InvoiceRenderOutput> {
    const bytes = await renderRechnungV2({
      verein: {
        name: input.verein.name,
        adresseSingleLine: addressOneLine(input.verein.adresse),
        adresseLines: addressLines(input.verein.adresse),
        vereinsregister: input.verein.vereinsregister,
        steuernummer: input.verein.steuernummer,
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
