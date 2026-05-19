-- Phase 5: soft-delete support for projects + customers.
--
-- Adds `deleted_at` nullable timestamp to both tables.
-- Rows with deleted_at IS NOT NULL are treated as soft-deleted; the CRUD
-- routes filter them out of list views and refuse further edits.

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
