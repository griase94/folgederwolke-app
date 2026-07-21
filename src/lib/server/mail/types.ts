/**
 * Mail type definitions.
 *
 * MailMessage — the envelope passed to a MailProvider.
 * TemplateName — mirrors the mail_template Postgres enum (ADR-0005).
 * TemplateProps — per-template prop maps for type-safe sendMail() calls.
 */

import type {
  entityKindEnum,
  mailTemplateEnum,
} from "$lib/server/db/schema/enums.js";

// ---------------------------------------------------------------------------
// Wire message
// ---------------------------------------------------------------------------

/**
 * A file attached to an outgoing mail. `content` is the raw bytes (never a
 * persisted handle — attachments are ephemeral, the canonical PDF stays in
 * the blob, see mail-invoice.md §6.3). The no-op provider ignores attachments
 * entirely but still writes the sent_mails row for test assertions.
 */
export interface MailAttachment {
  filename: string;
  content: Uint8Array;
  contentType: string;
  /**
   * Content-ID for an INLINE attachment referenced from the HTML via
   * `<img src="cid:...">` (e.g. the Giro-QR image). When set, the provider
   * marks the part inline; the value must match the `cid:` used in the body,
   * WITHOUT the angle brackets. Omit for regular file attachments (the PDF).
   */
  cid?: string;
}

export interface MailMessage {
  /** Sender address — usually env.MAIL_FROM */
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  /** Optional file attachments (E3a: the invoice PDF rides along here). */
  attachments?: MailAttachment[];
}

// ---------------------------------------------------------------------------
// Template names — must stay in sync with mailTemplateEnum in enums.ts
// ---------------------------------------------------------------------------

export type TemplateName = (typeof mailTemplateEnum.enumValues)[number];
export type EntityKind = (typeof entityKindEnum.enumValues)[number];

// ---------------------------------------------------------------------------
// Per-template props
// ---------------------------------------------------------------------------

export interface EingangsMailProps {
  vorname: string;
  ausId: string;
  bezeichnung: string;
  betragCents: number;
  eingereichtAm: Date;
}

export interface ErstattungsMailProps {
  vorname: string;
  ausId: string;
  bezeichnung: string;
  betragCents: number;
  verwendungszweck: string;
  erstattungsAm: Date;
}

/**
 * Props for the Auslage-Ablehnung mail template.
 *
 * Sent when an admin rejects a submission in the audit inbox. The
 * `grund` field is a free-form message the admin can either pick from
 * a template (Phase 4 stretch) or write directly. Kept deliberately
 * minimal — emoji-free, formal-friendly German wording lives in the
 * Svelte template itself.
 */
export interface RejectionMailProps {
  vorname: string;
  ausId: string;
  bezeichnung: string;
  betragCents: number;
  grund: string;
  abgelehntAm: Date;
}

export interface BeitragsReminderProps {
  vorname: string;
  nachname: string;
  jahr: number;
  betragCents: number;
  iban: string;
  bic: string;
  bank: string;
  empfaenger: string;
}

export interface MagicLinkProps {
  email: string;
  magicUrl: string;
  /** Minutes until link expires — typically 15 */
  expiresInMinutes: number;
}

/**
 * Props for the Aufwandsspenden-Bestätigung mail template.
 *
 * BMF-Pflichtfelder per §10b EStG / §§ 50–52 EStDV:
 * - Name und Anschrift des Zuwendenden
 * - Betrag der Zuwendung (in Worten und Ziffern)
 * - Datum der Zuwendung (Verzichtdatum)
 * - Erklärung über Freistellungsbescheid (Steuernummer, Finanzamt, Datum)
 * - Nachweis der Satzungsmäßigkeit (VR-Nummer)
 * - Verwendungszweck (steuerlich begünstigter Zweck)
 */
export interface AufwandsspendenBestaetigungProps {
  vorname: string;
  nachname: string;
  /** Straße, Hausnummer, PLZ, Ort — single formatted string */
  adresse: string;
  /** Amount the member waived their reimbursement claim for, in cents */
  betragCents: number;
  /** Date the member signed the Verzichtserklärung */
  verzichtdatum: Date;
  /** Vereinsregisternummer (e.g. "VR 12345 Amtsgericht München") */
  vereinsregister: string;
  /** Steuernummer des Vereins beim Finanzamt */
  steuernummer: string;
  /** Finanzamt name */
  finanzamt: string;
  /** Date of the most recent Freistellungsbescheid */
  freistellungsbescheidDatum: Date;
  /** Steuerlich begünstigter Verwendungszweck (Satzungszweck) */
  verwendungszweck: string;
}

// ---------------------------------------------------------------------------
// Discriminated map for type-safe generic sendMail() overloads
// ---------------------------------------------------------------------------

/**
 * Sent when an admin shares an invoice with a customer (E-PR3 Versand-Pfad).
 * The canonical PDF rides along as a provider-layer attachment (E3a) — there
 * is no download CTA and no `/app/*` link in the customer-facing mail.
 *
 * The bank-transfer block (iban/bic/empfaenger) is accompanied by the
 * server-rendered EPC-069 Giro-QR image when `qrPngCid` is set — embedded as a
 * CID inline attachment (never a data-URI, which many mail clients strip).
 * When bank data is incomplete the block degrades to the Überweisung hint.
 */
export interface InvoiceVersendetMailProps {
  customerName: string;
  /**
   * Verbatim `customers.anrede` ("Liebe Maria") or null. Null → neutral
   * "Hallo!" fallback. NEVER "Liebe:r {Firmenname}" (mail-invoice.md §1.3).
   */
  anrede: string | null;
  invoiceNumber: string;
  bezeichnung: string;
  bruttoCents: number;
  currency: string;
  /** ISO YYYY-MM-DD */
  rechnungsdatum: string;
  /** ISO YYYY-MM-DD or null */
  faelligkeitsDatum: string | null;
  /**
   * Verein IBAN — drives the bank-transfer block. Optional so a deployment
   * without configured bank data still sends a valid mail (Überweisung hint
   * only). The full bank table needs iban + bic + empfaenger + EUR.
   */
  iban?: string;
  /** Verein BIC — part of the bank-transfer block gate. */
  bic?: string;
  /** Recipient name for the bank-transfer block — the Verein name. */
  empfaenger?: string;
  /**
   * Content-ID of the embedded EPC-069 Giro-QR PNG. Set by the send handler
   * when iban + bic + empfaenger are present and currency is EUR; the template
   * renders `<img src="cid:{qrPngCid}">`. Undefined → no QR image (hint only).
   */
  qrPngCid?: string;
}

export interface ApprovalMailProps {
  vorname: string;
  ausId: string;
  bezeichnung: string;
  betragCents: number;
  kategorie: string;
  decidedAt: string;
}

export interface TemplateProps {
  magic_link: MagicLinkProps;
  auslage_eingang: EingangsMailProps;
  auslage_erstattet: ErstattungsMailProps;
  auslage_abgelehnt: RejectionMailProps;
  /** Aufwandsspende donation receipt — BMF-Pflichtfelder per §10b EStG. */
  spende_bescheinigung: AufwandsspendenBestaetigungProps;
  beitrag_reminder: BeitragsReminderProps;
  invoice_versendet: InvoiceVersendetMailProps;
  /** ApprovalMail — sent when admin approves an Auslage submission (C7-INBOX). */
  auslage_approved: ApprovalMailProps;
}
