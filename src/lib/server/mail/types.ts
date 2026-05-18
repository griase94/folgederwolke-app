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

/** Stub — Phase 2 (D9 deferred). */
export interface AufwandsspendenBestaetigungProps {
  vorname: string;
  nachname: string;
  betragCents: number;
}

// ---------------------------------------------------------------------------
// Discriminated map for type-safe generic sendMail() overloads
// ---------------------------------------------------------------------------

export interface TemplateProps {
  magic_link: MagicLinkProps;
  auslage_eingang: EingangsMailProps;
  auslage_erstattet: ErstattungsMailProps;
  auslage_abgelehnt: Record<string, never>; // Phase 2
  spende_bescheinigung: Record<string, never>; // Phase 2
  beitrag_reminder: BeitragsReminderProps;
  invoice_versendet: Record<string, never>; // Phase 2
}
