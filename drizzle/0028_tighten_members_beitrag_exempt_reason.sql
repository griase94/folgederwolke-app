-- Migration 0028: tighten members.beitrag_exempt_reason consistency.
--
-- The column was nullable since migration 0020 (C5-MEM-full). This migration
-- enforces a CHECK constraint requiring a non-empty reason whenever
-- beitrag_exempt=true, and backfills any existing exempt members that
-- have a null/blank reason with a placeholder so the constraint applies cleanly.
--
-- Two-step: backfill first, then add constraint (avoids constraint violation
-- on existing rows).

-- Step 1: backfill existing exempt members that have no reason
UPDATE members
SET beitrag_exempt_reason = 'Ehrenmitgliedschaft (Backfill)'
WHERE beitrag_exempt = true
  AND (beitrag_exempt_reason IS NULL OR length(trim(beitrag_exempt_reason)) = 0);

-- Step 2: enforce — any future INSERT or UPDATE must satisfy this rule
ALTER TABLE members
  ADD CONSTRAINT members_beitrag_exempt_reason_when_exempt_ck CHECK (
    beitrag_exempt = false
    OR (beitrag_exempt_reason IS NOT NULL AND length(trim(beitrag_exempt_reason)) > 0)
  );
