-- Phase 11 — invoice PDFs migrate from invoices.pdf_bytes (bytea) to Vercel Blob
-- via the Phase 9 files/FileStorage pipeline.
--
-- Two safety guards bracket the destructive parts:
--   (1) refuse the TRUNCATE if any app-created invoice has been written since
--       2026-04-01 (cutoff = start of real-use). All current rows are dummy
--       test data; the guard catches an accidental real invoice slipped in.
--   (2) refuse the DROP COLUMN if any pdf_bytes value survived the truncate.
--
-- audit_log rows referencing truncated invoice ids are PRESERVED by design —
-- the hash chain (ADR-0004) does not dereference entity_id, so removing
-- entities does not corrupt the chain.
--
-- Mitigation for losing the in-Postgres tamper-evidence on invoice PDFs:
-- finalizePdfJob now emits an audit_log row carrying files.sha256 at upload
-- time, so any silent blob mutation is detectable via the hash-chained log
-- even though the off-platform `files-backup` workflow remains parked
-- (see ADR-0012 update).

-- ── Guard 1: TRUNCATE precondition ───────────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM invoices
   WHERE source = 'app' AND created_at > TIMESTAMPTZ '2026-04-01 00:00:00+00';
  IF n > 0 THEN
    RAISE EXCEPTION 'Refusing TRUNCATE: % app-created invoices since 2026-04-01 — would destroy GoBD/§14 UStG-relevant Original-Belege', n;
  END IF;
END$$;

-- Belt-and-braces: refuse if ANY invoice is festgeschrieben, regardless of
-- source. Festschreibung lock (ADR-0006) means the row is legally immutable —
-- TRUNCATE bypasses triggers and would silently void that. No real
-- Festschreibung has been performed against current dummy data, so this
-- guard is structurally never expected to fire — but documents the invariant.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM invoices WHERE festgeschrieben_at IS NOT NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'Refusing TRUNCATE: % festgeschriebene invoices present (ADR-0006 immutability)', n;
  END IF;
END$$;

TRUNCATE invoices, invoice_jobs RESTART IDENTITY CASCADE;

-- ── Guard 2: DROP COLUMN precondition ────────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM invoices WHERE pdf_bytes IS NOT NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'Refusing to drop pdf_bytes: % rows still hold bytes (TRUNCATE should have cleared this — investigate)', n;
  END IF;
END$$;

-- ── Drop the Drive-era columns ──────────────────────────────────────────────
-- Index + CHECK constraint on now-dead columns go first or DROP COLUMN
-- leaves phantom entries in pg_class.
DROP INDEX IF EXISTS invoices_drive_status_idx;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_drive_status_enum_ck;

ALTER TABLE invoices DROP COLUMN pdf_bytes;
ALTER TABLE invoices DROP COLUMN drive_pdf_file_id;
ALTER TABLE invoices DROP COLUMN drive_status;

-- ── Add the blob FK ─────────────────────────────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN pdf_file_id uuid REFERENCES files(id) ON DELETE RESTRICT;

CREATE INDEX invoices_pdf_file_id_idx
  ON invoices(pdf_file_id) WHERE pdf_file_id IS NOT NULL;

COMMENT ON COLUMN invoices.pdf_file_id IS
  'FK to files.id for the canonical PDF. NULL while job is queued/generating; set after blob upload + files INSERT succeed in finalizePdfJob.';
