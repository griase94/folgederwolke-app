-- Migration 0005: invoices.pdf_bytes + drive_status (Drive-failure resilience).
--
-- Phase 5 invoice flow uses pdf-lib to generate the PDF in-process (no Drive
-- dependency for content). Drive is only used to STORE the generated PDF.
-- Because OAuth scope is `drive.file`, the app can only read/write files it
-- creates; if Drive upload fails for any reason, we keep the PDF bytes in
-- the database so admins can still download the invoice from the app.
--
-- drive_status = 'pending' | 'uploaded' | 'failed' | 'skipped'
--   pending  — local PDF generated, upload not yet attempted
--   uploaded — successfully uploaded to Drive, drive_pdf_file_id is set
--   failed   — Drive upload attempted and errored, see invoice_jobs.last_error
--   skipped  — admin opted out of Drive sync (future Phase 7 setting)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS pdf_bytes bytea,
  ADD COLUMN IF NOT EXISTS drive_status text;

CREATE INDEX IF NOT EXISTS invoices_drive_status_idx
  ON invoices (drive_status)
  WHERE drive_status IS NOT NULL;
