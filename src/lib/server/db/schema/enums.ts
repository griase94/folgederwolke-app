/**
 * Centralized Postgres enum definitions.
 *
 * Each enum is declared once here and re-imported by tables. Adding a value
 * is an `ALTER TYPE ... ADD VALUE` — drizzle-kit emits this automatically.
 * Removing a value is a multi-step manual migration (rewrite affected rows
 * first); avoid.
 */
import { pgEnum } from "drizzle-orm/pg-core";

/** Steuerliche Sphäre (ADR-0002). Values are canonical lowercase enum keys. */
export const sphereEnum = pgEnum("sphere", [
  "ideeller",
  "vermoegen",
  "zweckbetrieb",
  "wirtschaftlich",
]);

/**
 * Workflow status for an Auslage / Expense.
 * Mirrors legacy STATUS constants but normalized — emojis live in the UI,
 * not in the database.
 */
export const statusEnum = pgEnum("status", [
  "zu_pruefen",
  "in_pruefung",
  "geprueft",
  "abgelehnt",
  "importiert",
  "erstattet",
]);

/**
 * Members.role within the Verein. Free-text in legacy; here a closed set.
 *
 * Night-2 C5-MEM-full adds `extern` (non-member contributors, e.g. external
 * Auslage submitters) and `helfer` (regular helpers who are not yet — or
 * never were — Vereinsmitglieder but participate in our activities).
 */
export const memberRoleEnum = pgEnum("member_role", [
  "vorstand",
  "kassenwart",
  "schriftfuehrer",
  "mitglied",
  "fördermitglied",
  "extern",
  "helfer",
]);

/**
 * Auth role — user_role (ADR-0012). Enum (not bool) so future
 * `steuerberater` / `member_self_service` adds are non-breaking.
 */
export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "steuerberater",
  "member_self_service",
]);

/** Spendenart per legacy STAMMDATEN_SPENDENARTEN. Aufwandsspende deferred (D9). */
export const spendeKindEnum = pgEnum("spende_kind", [
  "geldspende",
  "sachspende",
  "aufwandsspende",
]);

/** Bescheid-Typ for Finanzamt-Bescheinigungen (donation receipts). */
export const bescheidTypEnum = pgEnum("bescheid_typ", [
  "geldspende",
  "sachspende",
  "aufwandsspende",
  "sammelbestaetigung",
]);

/** Mail template identifiers (ADR-0005). */
export const mailTemplateEnum = pgEnum("mail_template", [
  "magic_link",
  "auslage_eingang",
  "auslage_erstattet",
  "auslage_abgelehnt",
  "spende_bescheinigung",
  "beitrag_reminder",
  "invoice_versendet",
  "auslage_approved",
]);

/** Audit-log action verbs (ADR-0004). */
export const auditActionEnum = pgEnum("audit_action", [
  "create",
  "update",
  "delete",
  "approve",
  "reject",
  "reimburse",
  "import",
  "festschreibung",
  "storno",
  "sign_in",
  "sign_out",
  "magic_link_issue",
  "magic_link_verify",
]);

/** Entity-kind discriminator (used by audit_log + sent_mails). */
export const entityKindEnum = pgEnum("entity_kind", [
  "user",
  "session",
  "member",
  "customer",
  "project",
  "kategorie",
  "zahlungsart",
  "expense",
  "income",
  "donation",
  "invoice",
  "auslagen_submission",
  "invoice_job",
  "settings",
  "file",
]);

/** Zahlungsart kind (transport-layer for legacy Banküberweisung/Bar etc.). */
export const zahlungsartKindEnum = pgEnum("zahlungsart_kind", [
  "bank",
  "paypal",
  "bar",
  "lastschrift",
  "verrechnung",
  "verzicht",
]);

/** Zweckbindung mode for donations. */
export const zweckbindungKindEnum = pgEnum("zweckbindung_kind", [
  "zweckfrei",
  "zweckgebunden",
]);

/**
 * bezahlt_von discriminator (ADR-0007). The remaining three "extern"
 * fields are nullable text columns gated by a CHECK constraint.
 */
export const bezahltVonKindEnum = pgEnum("bezahlt_von_kind", [
  "verein",
  "member",
  "extern",
]);

/** Async invoice PDF generation job status (§6.4). */
export const invoiceJobStatusEnum = pgEnum("invoice_job_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
]);

/** PDF generation status for invoice rows. */
export const pdfStatusEnum = pgEnum("pdf_status", [
  "not_generated",
  "queued",
  "running",
  "generated",
  "failed",
]);

/** Source provenance marker (ADR-0010). New rows get 'app'; importer overrides. */
export const sourceKindEnum = pgEnum("source_kind", [
  "app",
  "form",
  "sheet_import",
  "fixture",
]);

/** Mail send-status (ADR-0005). */
export const mailStatusEnum = pgEnum("mail_status", [
  "queued",
  "sent",
  "bounced",
  "failed",
]);
