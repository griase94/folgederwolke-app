-- Phase 2 server hardening — additions to auslagen_submissions.
--
-- - consent_text_version : DSGVO compliance — snapshot of the legal text
--                          version the submitter agreed to.
-- - consent_given_at     : server-side timestamp of the consent checkbox.
-- - reviewed_at          : admin first-view marker (Phase 4 audit inbox).
--
-- Two-step approach for consent_text_version: add nullable, backfill,
-- then enforce NOT NULL — keeps existing rows intact.

ALTER TABLE "auslagen_submissions"
  ADD COLUMN IF NOT EXISTS "consent_text_version" text;
--> statement-breakpoint
ALTER TABLE "auslagen_submissions"
  ADD COLUMN IF NOT EXISTS "consent_given_at" timestamp with time zone NOT NULL DEFAULT now();
--> statement-breakpoint
ALTER TABLE "auslagen_submissions"
  ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "auslagen_submissions"
  SET "consent_text_version" = 'unknown-pre-v1'
  WHERE "consent_text_version" IS NULL;
--> statement-breakpoint
ALTER TABLE "auslagen_submissions"
  ALTER COLUMN "consent_text_version" SET NOT NULL;
