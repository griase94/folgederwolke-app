-- 0013_expenses_allow_aus_prefix.sql
--
-- Fix prod 500s on POST /app/inbox/<AUS-...>/approve (PostgreSQL 23514).
--
-- The audit-inbox approve flow reuses the submission's AUS-YYYY-NNN business id
-- as the resulting expenses row's business_id (audit-inbox-actions.ts:342, see
-- ADR-0010 / file header comment "audit trail stays anchored to a single
-- identifier"). The original constraint in drizzle/0000_init.sql limited the
-- prefix to `A-`, so every approve INSERT failed.
--
-- This migration:
--   1. Widens `expenses_business_id_format_ck` to accept both `A-` (direct app
--      entry) and `AUS-` (form-submission carryover).
--   2. Rewrites `expenses_business_id_year_ck` to extract the year via regex
--      capture so the 4-char `AUS-` prefix doesn't shift the offset and break
--      the year invariant.
--
-- Note: app code `/app/transactions/neu` is fixed in this same PR to use the
-- `A-` prefix for direct entries (allocateBusinessId("A", ...)). `AUS-` remains
-- reserved for submissions promoted via the inbox.

ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "expenses_business_id_format_ck";--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_business_id_format_ck"
  CHECK (business_id ~ '^(A|AUS)-[0-9]{4}-[0-9]{3,}$');--> statement-breakpoint

ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "expenses_business_id_year_ck";--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_business_id_year_ck"
  CHECK ((substring(business_id from '^(?:A|AUS)-(\d{4})-'))::int = year_of_buchung);
