-- A-S3: one expense carries at most ONE submission item.
--
-- `approved_expense_id` had a foreign key but no uniqueness, so the schema
-- permitted two submissions pointing at the same expense. That is not a
-- cosmetic gap: the Überweisungs-Werkstatt resolves the payout IBAN and the
-- AUS-Nr from the submission, and a row-multiplying join would show — and
-- total — the same amount twice. Money double-counted on screen.
--
-- The approve path already creates exactly one expense per submission, so this
-- index records an invariant the code has always held; it does not change
-- behaviour, it makes the guarantee enforceable.
--
-- PARTIAL: only rows that actually link an expense participate. Un-approved
-- submissions all carry NULL and must stay free to do so.
--
-- Idempotent + single-transaction safe: the migrator runs the whole pending
-- batch in ONE transaction, so this must neither fail on a pre-existing index
-- nor use CONCURRENTLY (which cannot run inside a transaction). The table is
-- Verein-sized; a plain build is instant.
CREATE UNIQUE INDEX IF NOT EXISTS "auslagen_submissions_approved_expense_uq"
  ON "auslagen_submissions" ("approved_expense_id")
  WHERE "approved_expense_id" IS NOT NULL;
