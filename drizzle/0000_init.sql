-- ============================================================================
-- Phase 1 — Hand-augmented prologue (must run before drizzle-generated DDL)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint

CREATE OR REPLACE FUNCTION year_for_booking(ts timestamptz)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT extract(year FROM ts AT TIME ZONE 'Europe/Berlin')::int
$$;--> statement-breakpoint

-- ============================================================================
-- drizzle-kit-generated schema
-- ============================================================================
CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'delete', 'approve', 'reject', 'reimburse', 'import', 'festschreibung', 'storno', 'sign_in', 'sign_out', 'magic_link_issue', 'magic_link_verify');--> statement-breakpoint
CREATE TYPE "public"."bescheid_typ" AS ENUM('geldspende', 'sachspende', 'aufwandsspende', 'sammelbestaetigung');--> statement-breakpoint
CREATE TYPE "public"."bezahlt_von_kind" AS ENUM('verein', 'member', 'extern');--> statement-breakpoint
CREATE TYPE "public"."entity_kind" AS ENUM('user', 'session', 'member', 'customer', 'project', 'kategorie', 'zahlungsart', 'expense', 'income', 'donation', 'invoice', 'auslagen_submission', 'invoice_job', 'settings');--> statement-breakpoint
CREATE TYPE "public"."invoice_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."mail_status" AS ENUM('queued', 'sent', 'bounced', 'failed');--> statement-breakpoint
CREATE TYPE "public"."mail_template" AS ENUM('magic_link', 'auslage_eingang', 'auslage_erstattet', 'auslage_abgelehnt', 'spende_bescheinigung', 'beitrag_reminder', 'invoice_versendet');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('vorstand', 'kassenwart', 'schriftfuehrer', 'mitglied', 'fördermitglied');--> statement-breakpoint
CREATE TYPE "public"."pdf_status" AS ENUM('not_generated', 'queued', 'running', 'generated', 'failed');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('app', 'form', 'sheet_import', 'fixture');--> statement-breakpoint
CREATE TYPE "public"."spende_kind" AS ENUM('geldspende', 'sachspende', 'aufwandsspende');--> statement-breakpoint
CREATE TYPE "public"."sphere" AS ENUM('ideeller', 'vermoegen', 'zweckbetrieb', 'wirtschaftlich');--> statement-breakpoint
CREATE TYPE "public"."status" AS ENUM('zu_pruefen', 'in_pruefung', 'geprueft', 'abgelehnt', 'importiert', 'erstattet');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'steuerberater', 'member_self_service');--> statement-breakpoint
CREATE TYPE "public"."zahlungsart_kind" AS ENUM('bank', 'paypal', 'bar', 'lastschrift', 'verrechnung', 'verzicht');--> statement-breakpoint
CREATE TYPE "public"."zweckbindung_kind" AS ENUM('zweckfrei', 'zweckgebunden');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"actor_kind" text DEFAULT 'user' NOT NULL,
	"actor_ip_prefix" text,
	"actor_ua_hash" text,
	"action" "audit_action" NOT NULL,
	"entity_kind" "entity_kind" NOT NULL,
	"entity_id" uuid,
	"entity_business_id" text,
	"payload" jsonb,
	"chain_seq" integer,
	"prev_hash" text,
	"row_hash" text
);
--> statement-breakpoint
CREATE TABLE "auslagen_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"bezeichnung" text NOT NULL,
	"kommentar" text,
	"rechnungsdatum" date,
	"betrag_cents" bigint NOT NULL,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"wofuer" text,
	"bezahlt_von_kind" "bezahlt_von_kind" NOT NULL,
	"bezahlt_von_member_id" uuid,
	"extern_name" text,
	"extern_iban" text,
	"extern_email" text,
	"bezahlt_von_display" text NOT NULL,
	"beleg_drive_file_id" text,
	"beleg_original_name" text,
	"decided_at" timestamp with time zone,
	"decision" text,
	"decided_by_user_id" uuid,
	"decision_reason" text,
	"approved_expense_id" uuid,
	"submitter_ip_prefix" text,
	"submitter_ua_hash" text
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"anrede" text,
	"address_block" text,
	"email" text,
	"notes" text,
	"is_fixture" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "donations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" text NOT NULL,
	"source" "source_kind" DEFAULT 'app' NOT NULL,
	"source_ref" text,
	"gebucht_am" timestamp with time zone DEFAULT now() NOT NULL,
	"year_of_buchung" integer GENERATED ALWAYS AS (year_for_booking(gebucht_am)) STORED,
	"zugewendet_am" date,
	"betrag_cents" bigint NOT NULL,
	"betrag_eur" numeric(12, 2) GENERATED ALWAYS AS ((betrag_cents::numeric / 100)) STORED,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"member_id" uuid,
	"spender_name" text,
	"spender_adresse" text,
	"spender_email" text,
	"spende_kind" "spende_kind" DEFAULT 'geldspende' NOT NULL,
	"zweckbindung_kind" "zweckbindung_kind" DEFAULT 'zweckfrei' NOT NULL,
	"zweckbindung_text" text,
	"kategorie_id" uuid,
	"kategorie_name_snapshot" text NOT NULL,
	"sphere_snapshot" "sphere" DEFAULT 'ideeller' NOT NULL,
	"project_id" uuid,
	"bescheinigung_nr" text,
	"bescheinigung_ausgestellt_am" date,
	"bescheinigung_ausgestellt_von_user_id" uuid,
	"bescheinigung_pdf_drive_file_id" text,
	"bescheid_typ" "bescheid_typ",
	"aufwandsspende_aus_expense_id" uuid,
	"aufwandsspende_verzicht_datum" date,
	"aufwandsspende_verzicht_text_snapshot" text,
	"festgeschrieben_at" timestamp with time zone,
	"festgeschrieben_by_user_id" uuid,
	"supersedes_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" text NOT NULL,
	"source" "source_kind" DEFAULT 'app' NOT NULL,
	"source_ref" text,
	"gebucht_am" timestamp with time zone DEFAULT now() NOT NULL,
	"year_of_buchung" integer GENERATED ALWAYS AS (year_for_booking(gebucht_am)) STORED,
	"rechnungsdatum" date,
	"abfluss_datum" date,
	"betrag_cents" bigint NOT NULL,
	"betrag_eur" numeric(12, 2) GENERATED ALWAYS AS ((betrag_cents::numeric / 100)) STORED,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"bezeichnung" text NOT NULL,
	"kommentar" text,
	"kategorie_id" uuid,
	"kategorie_name_snapshot" text NOT NULL,
	"sphere_snapshot" "sphere" NOT NULL,
	"sphere_override" "sphere",
	"sphere_override_reason" text,
	"project_id" uuid,
	"zahlungsart_id" uuid,
	"bezahlt_von_kind" "bezahlt_von_kind" NOT NULL,
	"bezahlt_von_member_id" uuid,
	"extern_name" text,
	"extern_iban" text,
	"extern_email" text,
	"bezahlt_von_display" text NOT NULL,
	"customer_id" uuid,
	"beleg_drive_file_id" text,
	"beleg_original_name" text,
	"status" "status" DEFAULT 'zu_pruefen' NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by_user_id" uuid,
	"rejected_at" timestamp with time zone,
	"rejected_by_user_id" uuid,
	"rejected_reason" text,
	"erstattet_am" date,
	"festgeschrieben_at" timestamp with time zone,
	"festgeschrieben_by_user_id" uuid,
	"supersedes_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "id_counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"kind" text NOT NULL,
	"next_value" bigint DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"source_hash" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"row_counts" jsonb,
	"status" text DEFAULT 'running' NOT NULL,
	"error_message" text,
	"triggered_by_user_id" uuid,
	"force_replace_used" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "income" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" text NOT NULL,
	"source" "source_kind" DEFAULT 'app' NOT NULL,
	"source_ref" text,
	"gebucht_am" timestamp with time zone DEFAULT now() NOT NULL,
	"year_of_buchung" integer GENERATED ALWAYS AS (year_for_booking(gebucht_am)) STORED,
	"geld_eingang_datum" date,
	"rechnungsdatum" date,
	"betrag_cents" bigint NOT NULL,
	"betrag_eur" numeric(12, 2) GENERATED ALWAYS AS ((betrag_cents::numeric / 100)) STORED,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"bezeichnung" text NOT NULL,
	"kommentar" text,
	"kategorie_id" uuid,
	"kategorie_name_snapshot" text NOT NULL,
	"sphere_snapshot" "sphere" NOT NULL,
	"project_id" uuid,
	"zahlungsart_id" uuid,
	"beleg_drive_file_id" text,
	"beleg_original_name" text,
	"festgeschrieben_at" timestamp with time zone,
	"festgeschrieben_by_user_id" uuid,
	"supersedes_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "invoice_job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"enqueued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" text NOT NULL,
	"source" "source_kind" DEFAULT 'app' NOT NULL,
	"source_ref" text,
	"gebucht_am" timestamp with time zone DEFAULT now() NOT NULL,
	"year_of_buchung" integer GENERATED ALWAYS AS (year_for_booking(gebucht_am)) STORED,
	"rechnungsdatum" date NOT NULL,
	"leistungs_datum" date,
	"faelligkeits_datum" date,
	"customer_id" uuid NOT NULL,
	"customer_name_snapshot" text NOT NULL,
	"customer_address_snapshot" text,
	"project_id" uuid,
	"netto_cents" bigint NOT NULL,
	"netto_eur" numeric(12, 2) GENERATED ALWAYS AS ((netto_cents::numeric / 100)) STORED,
	"ust_cents" bigint DEFAULT 0 NOT NULL,
	"brutto_cents" bigint NOT NULL,
	"brutto_eur" numeric(12, 2) GENERATED ALWAYS AS ((brutto_cents::numeric / 100)) STORED,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"kategorie_id" uuid,
	"kategorie_name_snapshot" text NOT NULL,
	"sphere_snapshot" "sphere" NOT NULL,
	"bezeichnung" text NOT NULL,
	"leistungs_beschreibung" text,
	"drive_doc_id" text,
	"drive_pdf_file_id" text,
	"pdf_status" "pdf_status" DEFAULT 'not_generated' NOT NULL,
	"pdf_status_error" text,
	"paid_by_income_id" uuid,
	"bezahlt_am" date,
	"festgeschrieben_at" timestamp with time zone,
	"festgeschrieben_by_user_id" uuid,
	"supersedes_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kategorien" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"sphere" "sphere" NOT NULL,
	"eur_zeile" integer,
	"anlage_gem_zeile" integer,
	"deactivated" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sent_mails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template" "mail_template" NOT NULL,
	"entity_kind" "entity_kind" NOT NULL,
	"entity_id" uuid,
	"send_attempt" integer DEFAULT 1 NOT NULL,
	"to_canonical" text NOT NULL,
	"to_display" text NOT NULL,
	"subject" text NOT NULL,
	"status" "mail_status" DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"provider_response" jsonb,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"bounced_at" timestamp with time zone,
	"failed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "member_beitrags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"betrag_cents" bigint NOT NULL,
	"betrag_eur" numeric(12, 2) GENERATED ALWAYS AS ((betrag_cents::numeric / 100)) STORED,
	"paid_cents" bigint DEFAULT 0 NOT NULL,
	"gezahlt_am" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vorname" text NOT NULL,
	"nachname" text NOT NULL,
	"email" text,
	"email_canonical" text,
	"iban" text,
	"role" "member_role" DEFAULT 'mitglied' NOT NULL,
	"eintritts_datum" date,
	"austritts_datum" date,
	"is_fixture" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" text NOT NULL,
	"name" text NOT NULL,
	"sphere_default" "sphere",
	"start_date" date,
	"end_date" date,
	"notes" text,
	"is_fixture" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"email_canonical" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"consumed_fingerprint" text
);
--> statement-breakpoint
CREATE TABLE "rate_limit_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"meta" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"device_fingerprint" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_canonical" text NOT NULL,
	"name" text,
	"role" "user_role" DEFAULT 'admin' NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zahlungsarten" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "zahlungsart_kind" NOT NULL,
	"label" text NOT NULL,
	"deactivated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auslagen_submissions" ADD CONSTRAINT "auslagen_submissions_bezahlt_von_member_id_members_id_fk" FOREIGN KEY ("bezahlt_von_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_kategorie_id_kategorien_id_fk" FOREIGN KEY ("kategorie_id") REFERENCES "public"."kategorien"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_bescheinigung_ausgestellt_von_user_id_users_id_fk" FOREIGN KEY ("bescheinigung_ausgestellt_von_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_aufwandsspende_aus_expense_id_expenses_id_fk" FOREIGN KEY ("aufwandsspende_aus_expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_festgeschrieben_by_user_id_users_id_fk" FOREIGN KEY ("festgeschrieben_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_supersedes_id_donations_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."donations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_kategorie_id_kategorien_id_fk" FOREIGN KEY ("kategorie_id") REFERENCES "public"."kategorien"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_zahlungsart_id_zahlungsarten_id_fk" FOREIGN KEY ("zahlungsart_id") REFERENCES "public"."zahlungsarten"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_bezahlt_von_member_id_members_id_fk" FOREIGN KEY ("bezahlt_von_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_rejected_by_user_id_users_id_fk" FOREIGN KEY ("rejected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_festgeschrieben_by_user_id_users_id_fk" FOREIGN KEY ("festgeschrieben_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supersedes_id_expenses_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_triggered_by_user_id_users_id_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income" ADD CONSTRAINT "income_kategorie_id_kategorien_id_fk" FOREIGN KEY ("kategorie_id") REFERENCES "public"."kategorien"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income" ADD CONSTRAINT "income_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income" ADD CONSTRAINT "income_zahlungsart_id_zahlungsarten_id_fk" FOREIGN KEY ("zahlungsart_id") REFERENCES "public"."zahlungsarten"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income" ADD CONSTRAINT "income_festgeschrieben_by_user_id_users_id_fk" FOREIGN KEY ("festgeschrieben_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income" ADD CONSTRAINT "income_supersedes_id_income_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."income"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income" ADD CONSTRAINT "income_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_jobs" ADD CONSTRAINT "invoice_jobs_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_kategorie_id_kategorien_id_fk" FOREIGN KEY ("kategorie_id") REFERENCES "public"."kategorien"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_festgeschrieben_by_user_id_users_id_fk" FOREIGN KEY ("festgeschrieben_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_supersedes_id_invoices_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_beitrags" ADD CONSTRAINT "member_beitrags_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_occurred_at_idx" ON "audit_log" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_kind","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_chain_seq_idx" ON "audit_log" USING btree ("chain_seq");--> statement-breakpoint
CREATE UNIQUE INDEX "auslagen_submissions_business_id_uq" ON "auslagen_submissions" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "auslagen_submissions_decided_at_idx" ON "auslagen_submissions" USING btree ("decided_at");--> statement-breakpoint
CREATE INDEX "auslagen_submissions_submitted_at_idx" ON "auslagen_submissions" USING btree ("submitted_at");--> statement-breakpoint
CREATE INDEX "customers_name_idx" ON "customers" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "donations_business_id_uq" ON "donations" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "donations_bescheinigung_nr_uq" ON "donations" USING btree ("bescheinigung_nr") WHERE bescheinigung_nr IS NOT NULL;--> statement-breakpoint
CREATE INDEX "donations_year_of_buchung_idx" ON "donations" USING btree ("year_of_buchung");--> statement-breakpoint
CREATE INDEX "donations_member_id_idx" ON "donations" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "donations_project_id_idx" ON "donations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "donations_gebucht_am_idx" ON "donations" USING btree ("gebucht_am");--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_business_id_uq" ON "expenses" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "expenses_status_idx" ON "expenses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "expenses_year_of_buchung_idx" ON "expenses" USING btree ("year_of_buchung");--> statement-breakpoint
CREATE INDEX "expenses_sphere_snapshot_idx" ON "expenses" USING btree ("sphere_snapshot");--> statement-breakpoint
CREATE INDEX "expenses_kategorie_id_idx" ON "expenses" USING btree ("kategorie_id");--> statement-breakpoint
CREATE INDEX "expenses_project_id_idx" ON "expenses" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "expenses_bezahlt_von_member_idx" ON "expenses" USING btree ("bezahlt_von_member_id");--> statement-breakpoint
CREATE INDEX "expenses_gebucht_am_idx" ON "expenses" USING btree ("gebucht_am");--> statement-breakpoint
CREATE UNIQUE INDEX "id_counters_year_kind_uq" ON "id_counters" USING btree ("year","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "import_runs_idempotency_key_uq" ON "import_runs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "income_business_id_uq" ON "income" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "income_year_of_buchung_idx" ON "income" USING btree ("year_of_buchung");--> statement-breakpoint
CREATE INDEX "income_sphere_snapshot_idx" ON "income" USING btree ("sphere_snapshot");--> statement-breakpoint
CREATE INDEX "income_kategorie_id_idx" ON "income" USING btree ("kategorie_id");--> statement-breakpoint
CREATE INDEX "income_project_id_idx" ON "income" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "income_gebucht_am_idx" ON "income" USING btree ("gebucht_am");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_jobs_idempotency_key_uq" ON "invoice_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "invoice_jobs_invoice_id_idx" ON "invoice_jobs" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_jobs_status_next_attempt_idx" ON "invoice_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_business_id_uq" ON "invoices" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "invoices_year_of_buchung_idx" ON "invoices" USING btree ("year_of_buchung");--> statement-breakpoint
CREATE INDEX "invoices_customer_id_idx" ON "invoices" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "invoices_project_id_idx" ON "invoices" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "invoices_pdf_status_idx" ON "invoices" USING btree ("pdf_status");--> statement-breakpoint
CREATE INDEX "invoices_rechnungsdatum_idx" ON "invoices" USING btree ("rechnungsdatum");--> statement-breakpoint
CREATE UNIQUE INDEX "kategorien_kind_name_uq" ON "kategorien" USING btree ("kind","name");--> statement-breakpoint
CREATE INDEX "kategorien_sphere_idx" ON "kategorien" USING btree ("sphere");--> statement-breakpoint
CREATE UNIQUE INDEX "sent_mails_template_entity_attempt_uq" ON "sent_mails" USING btree ("template","entity_kind","entity_id","send_attempt");--> statement-breakpoint
CREATE INDEX "sent_mails_status_idx" ON "sent_mails" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sent_mails_queued_at_idx" ON "sent_mails" USING btree ("queued_at");--> statement-breakpoint
CREATE INDEX "sent_mails_provider_message_id_idx" ON "sent_mails" USING btree ("provider_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_beitrags_member_year_uq" ON "member_beitrags" USING btree ("member_id","year");--> statement-breakpoint
CREATE INDEX "member_beitrags_year_idx" ON "member_beitrags" USING btree ("year");--> statement-breakpoint
CREATE INDEX "members_nachname_idx" ON "members" USING btree ("nachname");--> statement-breakpoint
CREATE INDEX "members_email_canonical_idx" ON "members" USING btree ("email_canonical");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_business_id_uq" ON "projects" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "projects_name_idx" ON "projects" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "magic_links_token_hash_uq" ON "magic_links" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "magic_links_email_canonical_idx" ON "magic_links" USING btree ("email_canonical");--> statement-breakpoint
CREATE INDEX "magic_links_expires_at_idx" ON "magic_links" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "rate_limit_attempts_key_occurred_at_idx" ON "rate_limit_attempts" USING btree ("key","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_canonical_uq" ON "users" USING btree ("email_canonical");--> statement-breakpoint
CREATE UNIQUE INDEX "zahlungsarten_label_uq" ON "zahlungsarten" USING btree ("label");--> statement-breakpoint
CREATE INDEX "zahlungsarten_kind_idx" ON "zahlungsarten" USING btree ("kind");--> statement-breakpoint

-- ============================================================================
-- Phase 1 — Hand-augmented epilogue
-- ============================================================================
-- CHECK constraints — business_id format + year-consistency (ADR-0010).
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_business_id_format_ck"
  CHECK (business_id ~ '^A-[0-9]{4}-[0-9]{3,}$');--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_business_id_year_ck"
  CHECK ((substring(business_id from 3 for 4))::int = year_of_buchung);--> statement-breakpoint
ALTER TABLE "income" ADD CONSTRAINT "income_business_id_format_ck"
  CHECK (business_id ~ '^E-[0-9]{4}-[0-9]{3,}$');--> statement-breakpoint
ALTER TABLE "income" ADD CONSTRAINT "income_business_id_year_ck"
  CHECK ((substring(business_id from 3 for 4))::int = year_of_buchung);--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_business_id_format_ck"
  CHECK (business_id ~ '^S-[0-9]{4}-[0-9]{3,}$');--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_business_id_year_ck"
  CHECK ((substring(business_id from 3 for 4))::int = year_of_buchung);--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_bescheinigung_nr_format_ck"
  CHECK (bescheinigung_nr IS NULL OR bescheinigung_nr ~ '^B-[0-9]{4}-[0-9]{3,}$');--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_business_id_format_ck"
  CHECK (business_id ~ '^FDW-[0-9]{4}-[0-9]{3,}$');--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_business_id_year_ck"
  CHECK ((substring(business_id from 5 for 4))::int = year_of_buchung);--> statement-breakpoint
ALTER TABLE "auslagen_submissions" ADD CONSTRAINT "auslagen_submissions_business_id_format_ck"
  CHECK (business_id ~ '^AUS-[0-9]{4}-[0-9]{3,}$');--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_business_id_format_ck"
  CHECK (business_id ~ '^P-[0-9]{4}-[0-9]{3,}$');--> statement-breakpoint

ALTER TABLE "kategorien" ADD CONSTRAINT "kategorien_kind_ck"
  CHECK (kind IN ('expense', 'income'));--> statement-breakpoint

-- CHECK — bezahlt_von discriminated union (ADR-0007).
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_bezahlt_von_union_ck" CHECK (
  (bezahlt_von_kind = 'verein'
     AND bezahlt_von_member_id IS NULL
     AND extern_name IS NULL AND extern_iban IS NULL AND extern_email IS NULL)
  OR
  (bezahlt_von_kind = 'member'
     AND bezahlt_von_member_id IS NOT NULL
     AND extern_name IS NULL AND extern_iban IS NULL AND extern_email IS NULL)
  OR
  (bezahlt_von_kind = 'extern'
     AND bezahlt_von_member_id IS NULL
     AND extern_name IS NOT NULL)
);--> statement-breakpoint
ALTER TABLE "auslagen_submissions" ADD CONSTRAINT "auslagen_submissions_bezahlt_von_union_ck" CHECK (
  (bezahlt_von_kind = 'verein'
     AND bezahlt_von_member_id IS NULL
     AND extern_name IS NULL AND extern_iban IS NULL AND extern_email IS NULL)
  OR
  (bezahlt_von_kind = 'member'
     AND bezahlt_von_member_id IS NOT NULL
     AND extern_name IS NULL AND extern_iban IS NULL AND extern_email IS NULL)
  OR
  (bezahlt_von_kind = 'extern'
     AND bezahlt_von_member_id IS NULL
     AND extern_name IS NOT NULL)
);--> statement-breakpoint

-- CHECK — Aufwandsspende fields must be consistent with spende_kind (D9, schema-only).
ALTER TABLE "donations" ADD CONSTRAINT "donations_aufwandsspende_ck" CHECK (
  (spende_kind <> 'aufwandsspende'
     AND aufwandsspende_aus_expense_id IS NULL
     AND aufwandsspende_verzicht_datum IS NULL)
  OR
  (spende_kind = 'aufwandsspende')
);--> statement-breakpoint

-- CHECK — Money non-negative on most tables (expenses allow negative for Storno).
ALTER TABLE "income" ADD CONSTRAINT "income_betrag_nonneg_ck" CHECK (betrag_cents >= 0);--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_betrag_nonneg_ck" CHECK (betrag_cents >= 0);--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_netto_nonneg_ck" CHECK (netto_cents >= 0);--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_brutto_nonneg_ck" CHECK (brutto_cents >= 0);--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_ust_nonneg_ck" CHECK (ust_cents >= 0);--> statement-breakpoint
ALTER TABLE "member_beitrags" ADD CONSTRAINT "member_beitrags_amounts_nonneg_ck"
  CHECK (betrag_cents >= 0 AND paid_cents >= 0);--> statement-breakpoint

-- Partial indexes per §4.4.
CREATE INDEX "expenses_pay_queue_idx" ON "expenses" (approved_at)
  WHERE approved_at IS NOT NULL AND erstattet_am IS NULL;--> statement-breakpoint

-- pg_trgm GIN — admin search (§4.4).
CREATE INDEX "expenses_bezeichnung_trgm_idx" ON "expenses" USING gin (bezeichnung gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "auslagen_submissions_bezeichnung_trgm_idx" ON "auslagen_submissions" USING gin (bezeichnung gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "customers_name_trgm_idx" ON "customers" USING gin (name gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "projects_name_trgm_idx" ON "projects" USING gin (name gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "members_nachname_trgm_idx" ON "members" USING gin (nachname gin_trgm_ops);--> statement-breakpoint

-- ADR-0006: close_buchhaltungsjahr(p_year, p_actor).
CREATE OR REPLACE FUNCTION close_buchhaltungsjahr(p_year integer, p_actor uuid)
RETURNS TABLE (
  table_name text,
  rows_festgeschrieben bigint
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  IF p_year < 2020 OR p_year > extract(year FROM now() AT TIME ZONE 'Europe/Berlin')::int THEN
    RAISE EXCEPTION 'close_buchhaltungsjahr: refusing year %', p_year;
  END IF;

  RETURN QUERY
  WITH e AS (
    UPDATE expenses
       SET festgeschrieben_at = v_now,
           festgeschrieben_by_user_id = p_actor,
           updated_at = v_now
     WHERE year_of_buchung = p_year
       AND festgeschrieben_at IS NULL
    RETURNING 1
  ), i AS (
    UPDATE income
       SET festgeschrieben_at = v_now,
           festgeschrieben_by_user_id = p_actor,
           updated_at = v_now
     WHERE year_of_buchung = p_year
       AND festgeschrieben_at IS NULL
    RETURNING 1
  ), d AS (
    UPDATE donations
       SET festgeschrieben_at = v_now,
           festgeschrieben_by_user_id = p_actor,
           updated_at = v_now
     WHERE year_of_buchung = p_year
       AND festgeschrieben_at IS NULL
    RETURNING 1
  ), v AS (
    UPDATE invoices
       SET festgeschrieben_at = v_now,
           festgeschrieben_by_user_id = p_actor,
           updated_at = v_now
     WHERE year_of_buchung = p_year
       AND festgeschrieben_at IS NULL
    RETURNING 1
  )
  SELECT 'expenses'::text, (SELECT count(*) FROM e)
  UNION ALL SELECT 'income'::text, (SELECT count(*) FROM i)
  UNION ALL SELECT 'donations'::text, (SELECT count(*) FROM d)
  UNION ALL SELECT 'invoices'::text, (SELECT count(*) FROM v);
END;
$$;--> statement-breakpoint

-- ADR-0010: seed_id_counter_from_corpus(p_year, p_kind).
CREATE OR REPLACE FUNCTION seed_id_counter_from_corpus(p_year integer, p_kind text)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_max bigint := 0;
  v_table text;
BEGIN
  v_table := CASE p_kind
    WHEN 'A' THEN 'expenses'
    WHEN 'E' THEN 'income'
    WHEN 'S' THEN 'donations'
    WHEN 'FDW' THEN 'invoices'
    WHEN 'B' THEN 'donations'
    WHEN 'AUS' THEN 'auslagen_submissions'
    ELSE NULL
  END;

  IF v_table IS NULL THEN
    RAISE EXCEPTION 'seed_id_counter_from_corpus: unknown kind %', p_kind;
  END IF;

  IF p_kind = 'B' THEN
    EXECUTE format(
      'SELECT COALESCE(MAX((regexp_match(bescheinigung_nr, ''^B-(\d{4})-(\d+)$''))[2]::bigint), 0)
         FROM %I
        WHERE bescheinigung_nr LIKE ''B-%s-%%''',
      v_table, p_year
    ) INTO v_max;
  ELSE
    EXECUTE format(
      'SELECT COALESCE(MAX((regexp_match(business_id, ''^%s-(\d{4})-(\d+)$''))[2]::bigint), 0)
         FROM %I
        WHERE business_id LIKE ''%s-%s-%%''',
      p_kind, v_table, p_kind, p_year
    ) INTO v_max;
  END IF;

  INSERT INTO id_counters (year, kind, next_value, updated_at)
  VALUES (p_year, p_kind, v_max + 1, now())
  ON CONFLICT (year, kind) DO UPDATE
    SET next_value = GREATEST(id_counters.next_value, EXCLUDED.next_value),
        updated_at = now();

  RETURN v_max + 1;
END;
$$;
