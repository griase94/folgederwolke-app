/**
 * InvoicePdfRenderer interface — §4.1.1 #4.
 *
 * Abstracts PDF rendering so the route layer and domain services do not
 * couple to the underlying engine (pdf-lib today; could be Puppeteer or
 * Google Docs export in the future without touching callers).
 *
 * Phase 5 ships a pdf-lib implementation (`PdfLibInvoiceRenderer`) that
 * runs entirely in-process and has no external dependencies. This matters
 * because the OAuth scope is `drive.file` — the app can only access files
 * it creates. Rendering the PDF in-process means we never need to read a
 * pre-existing Google Doc template the app does not own. Drive is used
 * ONLY to store the generated PDF as convenience storage.
 */

/** Per-line entry on the rendered invoice (single line for v1; the
 *  template still supports multi-line in case Phase 7 expands the form). */
export interface InvoicePdfLineItem {
  /** Free-form description, multi-line allowed (split on `\n`). */
  beschreibung: string;
  /** Subtotal in cents — always equals `nettoCents` for v1. */
  nettoCents: number;
}

/** Renderer input — a snapshot of everything the PDF needs.
 *  Pure data: no DB rows, no IO. */
export interface InvoiceRenderInput {
  /** Invoice number (e.g. "FDW-2026-001"). */
  invoiceNumber: string;
  /** Rechnungsdatum (ISO `YYYY-MM-DD`). */
  rechnungsdatum: string;
  /** Leistungsdatum / Leistungszeitraum-Ende — optional. */
  leistungsDatum: string | null;
  /** Fälligkeitsdatum — optional. */
  faelligkeitsDatum: string | null;
  /** Phase 10 — free-text Leistungszeitraum (e.g. "Februar 2026").
   *  Renders as a row in the meta block; collapses when null/empty. */
  leistungszeitraum?: string | null;

  /** Verein issuing the invoice. */
  verein: {
    name: string;
    /** Multi-line address (newline separated). */
    adresse: string;
    steuernummer: string;
    vereinsregister: string;
    /** Optional banking block. */
    iban?: string;
    bic?: string;
    bank?: string;
    /** Footer-col-2 contact email (reuses env.MAIL_FROM). */
    contactEmail?: string;
  };

  /** Customer block. */
  customer: {
    /** Display name (snapshot at issue). */
    name: string;
    /** Multi-line address (snapshot). */
    addressBlock: string | null;
    /** Phase 10 — ISO 3166-1 alpha-2; renderer hides Land line for 'DE'. */
    country?: string;
  };

  /** Headline title shown above the line items (e.g. "Auftritt 12.05.2026"). */
  bezeichnung: string;
  /** Optional longer description shown beneath the headline. */
  leistungsBeschreibung: string | null;

  /** Line items (currently always exactly one). */
  lineItems: InvoicePdfLineItem[];

  /** Totals, all in cents. */
  nettoCents: number;
  ustCents: number;
  bruttoCents: number;
  currency: string;

  /** Footer note. v1 always says §19 UStG (Kleinunternehmer). */
  footerNote: string;

  /** Phase 10 — Kassenwärt:in name from settings (default "Julia Schwarz"). */
  kassenwaertName?: string;
}

/** Output of a render call — raw PDF bytes + media metadata. */
export interface InvoiceRenderOutput {
  /** PDF bytes (Uint8Array so the type is independent of Node Buffer). */
  bytes: Uint8Array;
  /** Suggested filename (no path). */
  suggestedFilename: string;
  /** Always "application/pdf". */
  mimeType: "application/pdf";
}

/** Engine-agnostic renderer contract. */
export interface InvoicePdfRenderer {
  render(input: InvoiceRenderInput): Promise<InvoiceRenderOutput>;
}
