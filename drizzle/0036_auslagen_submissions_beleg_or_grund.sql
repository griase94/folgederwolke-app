-- Custom migration: add CHECK constraint enforcing THE BELEG RULE on
-- auslagen_submissions. Either beleg_file_id or beleg_verzicht_grund must
-- be non-NULL for every row. The public form always uploads a real file, so
-- all existing rows have beleg_file_id set. Admin manual-import rows
-- (pre-launch) may have neither; wipe them first so the ADD CONSTRAINT cannot
-- fail the batch (pre-launch data is disposable per project policy).

-- Guard: only delete if there are NULL/NULL rows (idempotent on empty set).
DELETE FROM auslagen_submissions
WHERE beleg_file_id IS NULL AND beleg_verzicht_grund IS NULL;

-- Idempotent ADD CONSTRAINT: skip if the constraint already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'auslagen_submissions_beleg_or_grund_ck'
      AND conrelid = 'auslagen_submissions'::regclass
  ) THEN
    ALTER TABLE auslagen_submissions
      ADD CONSTRAINT auslagen_submissions_beleg_or_grund_ck
      CHECK (beleg_file_id IS NOT NULL OR beleg_verzicht_grund IS NOT NULL);
  END IF;
END
$$;