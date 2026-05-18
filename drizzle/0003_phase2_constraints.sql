-- ============================================================================
-- 0003_phase2_constraints.sql — Phase 2 hardening: index/constraint refinements
--
-- F1 (ADR-0005 honor for entity_id=NULL):
--   `sent_mails_template_entity_attempt_uq` must dedup across rows whose
--   entity_id IS NULL (settings-template mails). The default Postgres
--   semantics treat NULLs as distinct, breaking idempotency. We rebuild
--   the index with `NULLS NOT DISTINCT` (PG 15+ feature). Drizzle's
--   uniqueIndex builder doesn't expose this option yet — kept as raw SQL.
--
-- The migration is idempotent: it DROPs the existing index (under either
-- a CONSTRAINT or INDEX guise) and re-creates it with the desired option.
-- ============================================================================

-- Phase 1: drop the existing unique index (whether it was defined as a
-- constraint or a plain unique index). Postgres allows referencing both
-- via DROP INDEX once the table-level UNIQUE backing index is unwrapped,
-- but we cover both shapes for safety.
ALTER TABLE "sent_mails" DROP CONSTRAINT IF EXISTS "sent_mails_template_entity_attempt_uq";
--> statement-breakpoint
DROP INDEX IF EXISTS "sent_mails_template_entity_attempt_uq";
--> statement-breakpoint

-- Phase 2: re-create with NULLS NOT DISTINCT so settings-template mails
-- (entity_id IS NULL) dedup on (template, entity_kind, NULL, send_attempt).
CREATE UNIQUE INDEX "sent_mails_template_entity_attempt_uq"
  ON "sent_mails" ("template", "entity_kind", "entity_id", "send_attempt")
  NULLS NOT DISTINCT;
