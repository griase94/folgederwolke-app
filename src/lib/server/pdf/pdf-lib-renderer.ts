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
import { renderRechnungV2 } from "./templates/rechnung-v2/index.js";
import { addressLines, addressOneLine } from "$lib/server/domain/address.js";
import { leistungszeitraumFromDatum } from "$lib/domain/datum.js";

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
        contactPhone: input.verein.contactPhone ?? "",
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
      // Leistungszeitraum (§ 14 Abs. 4 Nr. 6 UStG) is always the compact month
      // now — the form derives it from the mandatory Leistungsdatum. For a
      // legacy/snapshot input missing the stored value, fall back to the month
      // of the Leistungsdatum (never a long sentence — it must fit the head);
      // "" if neither is present (the template omits the row defensively).
      leistungszeitraum:
        input.leistungszeitraum ??
        (input.leistungsDatum
          ? leistungszeitraumFromDatum(input.leistungsDatum)
          : ""),
      bezeichnung: input.bezeichnung,
      leistungsBeschreibung: input.leistungsBeschreibung ?? null,
      nettoCents: input.nettoCents,
      kassenwaertName: input.kassenwaertName ?? "",
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
