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

export interface MailMessage {
  /** Sender address — usually env.MAIL_FROM */
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
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

export interface TemplateProps {
  magic_link: MagicLinkProps;
  auslage_eingang: EingangsMailProps;
  auslage_erstattet: ErstattungsMailProps;
  auslage_abgelehnt: RejectionMailProps;
  /** Aufwandsspende donation receipt — BMF-Pflichtfelder per §10b EStG. */
  spende_bescheinigung: AufwandsspendenBestaetigungProps;
  beitrag_reminder: BeitragsReminderProps;
  invoice_versendet: Record<string, never>; // Phase 2
}
