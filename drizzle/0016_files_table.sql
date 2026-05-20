-- Phase 9: files table + FK columns + dedicated Festschreibung trigger for files.

CREATE TYPE file_kind AS ENUM ('beleg', 'rechnung', 'bescheinigung', 'export');
--> statement-breakpoint

CREATE TABLE files (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_key                 text NOT NULL,
  storage_backend             text NOT NULL CHECK (storage_backend IN ('blob','local-fs')),
  mime_type                   text NOT NULL CHECK (mime_type IN (
                                'application/pdf','image/jpeg','image/png',
                                'image/webp','image/heic','image/heif'
                              )),
  byte_size                   bigint NOT NULL CHECK (byte_size > 0 AND byte_size <= 5497558138880),
  sha256                      text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  original_filename           text NOT NULL CHECK (char_length(original_filename) <= 255),
  kind                        file_kind NOT NULL,
  thumbnail_storage_key       text,
  uploaded_at                 timestamptz NOT NULL DEFAULT now(),
  uploaded_by_user_id         uuid REFERENCES users(id) ON DELETE RESTRICT,
  uploaded_by_submitter_email text,
  deleted_at                  timestamptz,
  delete_reason               text CHECK (delete_reason IN ('user_request','blob_missing','superseded','test_cleanup')),
  source_kind                 source_kind NOT NULL,
  year_of_buchung             integer GENERATED ALWAYS AS (year_for_booking(uploaded_at)) STORED,
  CONSTRAINT files_uploaded_by_one_of CHECK (
    (uploaded_by_user_id IS NOT NULL AND uploaded_by_submitter_email IS NULL)
    OR (uploaded_by_user_id IS NULL AND uploaded_by_submitter_email IS NOT NULL)
  ),
  CONSTRAINT files_deleted_reason_paired CHECK (
    (deleted_at IS NULL AND delete_reason IS NULL)
    OR (deleted_at IS NOT NULL AND delete_reason IS NOT NULL)
  )
);
--> statement-breakpoint

CREATE UNIQUE INDEX idx_files_storage_key   ON files (storage_key);
CREATE UNIQUE INDEX idx_files_sha256_active ON files (sha256) WHERE deleted_at IS NULL;
CREATE INDEX        idx_files_uploaded_at   ON files (uploaded_at);
CREATE INDEX        idx_files_year          ON files (year_of_buchung);
CREATE INDEX        idx_files_kind_year     ON files (kind, year_of_buchung);
--> statement-breakpoint

-- FK columns on owning entities (ON DELETE RESTRICT so files outlive references).
ALTER TABLE expenses              ADD COLUMN beleg_file_id          uuid REFERENCES files(id) ON DELETE RESTRICT;
ALTER TABLE income                ADD COLUMN beleg_file_id          uuid REFERENCES files(id) ON DELETE RESTRICT;
ALTER TABLE donations             ADD COLUMN beleg_file_id          uuid REFERENCES files(id) ON DELETE RESTRICT;
ALTER TABLE donations             ADD COLUMN bescheinigung_file_id  uuid REFERENCES files(id) ON DELETE RESTRICT;
ALTER TABLE auslagen_submissions  ADD COLUMN beleg_file_id          uuid REFERENCES files(id) ON DELETE RESTRICT;
--> statement-breakpoint

-- Partial indices on the new FK columns
CREATE INDEX expenses_beleg_file_id_idx              ON expenses(beleg_file_id)              WHERE beleg_file_id IS NOT NULL;
CREATE INDEX income_beleg_file_id_idx                ON income(beleg_file_id)                WHERE beleg_file_id IS NOT NULL;
CREATE INDEX donations_beleg_file_id_idx             ON donations(beleg_file_id)             WHERE beleg_file_id IS NOT NULL;
CREATE INDEX donations_bescheinigung_file_id_idx     ON donations(bescheinigung_file_id)     WHERE bescheinigung_file_id IS NOT NULL;
CREATE INDEX auslagen_submissions_beleg_file_id_idx  ON auslagen_submissions(beleg_file_id)  WHERE beleg_file_id IS NOT NULL;
--> statement-breakpoint

-- Dedicated Festschreibung trigger function for `files` — reads `uploaded_at`
-- (NOT `gebucht_am`, which is on entity tables but not on files).
-- Mirrors the shape of public.assert_not_festgeschrieben_fn() from 0014.
CREATE OR REPLACE FUNCTION public.assert_not_festgeschrieben_fn_files() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_frozen_until integer;
  v_row_year     integer;
BEGIN
  IF session_user <> 'app_runtime' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT public._festgeschrieben_extract_year(value)
    INTO v_frozen_until
    FROM public.settings
   WHERE key = 'festgeschrieben_bis';

  IF v_frozen_until IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- year_of_buchung is a STORED GENERATED column. OLD has it populated; for INSERT/UPDATE
  -- NEW.year_of_buchung is NULL inside BEFORE triggers (PG §38.5) so compute inline from
  -- NEW.uploaded_at.
  IF TG_OP = 'DELETE' THEN
    v_row_year := OLD.year_of_buchung;
  ELSIF TG_OP = 'UPDATE' THEN
    v_row_year := LEAST(
      COALESCE(OLD.year_of_buchung, 999999),
      COALESCE(public.year_for_booking(NEW.uploaded_at), 999999)
    );
    IF v_row_year = 999999 THEN v_row_year := NULL; END IF;
  ELSE  -- INSERT
    v_row_year := public.year_for_booking(NEW.uploaded_at);
  END IF;

  IF v_row_year IS NOT NULL AND v_row_year <= v_frozen_until THEN
    RAISE EXCEPTION
      'Festgeschriebenes Buchungsjahr %: % auf Tabelle % nicht zulässig (festgeschrieben_bis=%)',
      v_row_year, TG_OP, TG_TABLE_NAME, v_frozen_until
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
--> statement-breakpoint

CREATE TRIGGER assert_not_festgeschrieben_files_trg
  BEFORE INSERT OR UPDATE OR DELETE ON files
  FOR EACH ROW EXECUTE FUNCTION public.assert_not_festgeschrieben_fn_files();
