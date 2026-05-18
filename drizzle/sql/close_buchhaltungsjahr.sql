-- ADR-0006: Festschreibung — atomic year-close across all four entity tables.
--
-- Marks every expense / income / donation / invoice row with year_of_buchung
-- = p_year as festgeschrieben. After this runs:
--   - UPDATE attempts that touch festgeschrieben rows are forbidden by the
--     row-level trigger (Phase 7.5 ships the trigger; Phase 1 sets up the
--     columns to make it work).
--   - Corrections must go through Storno (negative betrag_cents + supersedes_id).
--
-- p_actor is the user_id of the closer (recorded for audit_log).
--
-- Returns the count of rows festgeschrieben per table for the audit-log payload.

CREATE OR REPLACE FUNCTION close_buchhaltungsjahr(p_year integer, p_actor uuid)
RETURNS TABLE (
  table_name text,
  rows_festgeschrieben bigint
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  -- Safety: refuse to close a future or far-past year.
  IF p_year < 2020 OR p_year > extract(year FROM now() AT TIME ZONE 'Europe/Berlin')::int THEN
    RAISE EXCEPTION 'close_buchhaltungsjahr: refusing year %', p_year;
  END IF;

  -- Refuse if the year is already (fully) festgeschrieben.
  IF EXISTS (
    SELECT 1 FROM expenses
    WHERE year_of_buchung = p_year AND festgeschrieben_at IS NULL
    LIMIT 1
  ) IS NULL AND EXISTS (
    SELECT 1 FROM expenses
    WHERE year_of_buchung = p_year AND festgeschrieben_at IS NOT NULL
    LIMIT 1
  ) THEN
    -- Already closed; idempotent return.
    RETURN QUERY
      SELECT 'expenses'::text, 0::bigint
      UNION ALL SELECT 'income'::text, 0::bigint
      UNION ALL SELECT 'donations'::text, 0::bigint
      UNION ALL SELECT 'invoices'::text, 0::bigint;
    RETURN;
  END IF;

  RETURN QUERY
  WITH e AS (
    UPDATE expenses
       SET festgeschrieben_at = v_now,
           festgeschrieben_by_user_id = p_actor,
           updated_at = v_now
     WHERE year_of_buchung = p_year
       AND festgeschrieben_at IS NULL
    RETURNING 1
  ), i AS (
    UPDATE income
       SET festgeschrieben_at = v_now,
           festgeschrieben_by_user_id = p_actor,
           updated_at = v_now
     WHERE year_of_buchung = p_year
       AND festgeschrieben_at IS NULL
    RETURNING 1
  ), d AS (
    UPDATE donations
       SET festgeschrieben_at = v_now,
           festgeschrieben_by_user_id = p_actor,
           updated_at = v_now
     WHERE year_of_buchung = p_year
       AND festgeschrieben_at IS NULL
    RETURNING 1
  ), v AS (
    UPDATE invoices
       SET festgeschrieben_at = v_now,
           festgeschrieben_by_user_id = p_actor,
           updated_at = v_now
     WHERE year_of_buchung = p_year
       AND festgeschrieben_at IS NULL
    RETURNING 1
  )
  SELECT 'expenses'::text, (SELECT count(*) FROM e)
  UNION ALL SELECT 'income'::text, (SELECT count(*) FROM i)
  UNION ALL SELECT 'donations'::text, (SELECT count(*) FROM d)
  UNION ALL SELECT 'invoices'::text, (SELECT count(*) FROM v);
END;
$$;
