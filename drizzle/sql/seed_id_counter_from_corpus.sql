-- ADR-0010: seed id_counters from imported corpus.
--
-- After the Phase 6 importer hydrates `expenses` / `income` / `donations` /
-- `invoices` with legacy business_ids (preserved verbatim from the sheet),
-- this function sets each (year, kind) counter to MAX(parsed_seq) + 1 so
-- that fresh app-issued IDs don't collide.
--
-- Caller passes one (p_year, p_kind) tuple per call; idempotent.

CREATE OR REPLACE FUNCTION seed_id_counter_from_corpus(p_year integer, p_kind text)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_max bigint := 0;
  v_table text;
  v_sql text;
BEGIN
  v_table := CASE p_kind
    WHEN 'A' THEN 'expenses'
    WHEN 'E' THEN 'income'
    WHEN 'S' THEN 'donations'
    WHEN 'FDW' THEN 'invoices'
    WHEN 'B' THEN 'donations'        -- bescheinigung_nr counter shares space
    WHEN 'AUS' THEN 'auslagen_submissions'
    ELSE NULL
  END;

  IF v_table IS NULL THEN
    RAISE EXCEPTION 'seed_id_counter_from_corpus: unknown kind %', p_kind;
  END IF;

  IF p_kind = 'B' THEN
    -- Bescheinigungs-Nr lives in a different column.
    EXECUTE format(
      'SELECT COALESCE(MAX((regexp_match(bescheinigung_nr, ''^B-(\d{4})-(\d+)$''))[2]::bigint), 0)
         FROM %I
        WHERE bescheinigung_nr LIKE ''B-%s-%%''',
      v_table, p_year
    ) INTO v_max;
  ELSE
    EXECUTE format(
      'SELECT COALESCE(MAX((regexp_match(business_id, ''^%s-(\d{4})-(\d+)$''))[2]::bigint), 0)
         FROM %I
        WHERE business_id LIKE ''%s-%s-%%''',
      p_kind, v_table, p_kind, p_year
    ) INTO v_max;
  END IF;

  INSERT INTO id_counters (year, kind, next_value, updated_at)
  VALUES (p_year, p_kind, v_max + 1, now())
  ON CONFLICT (year, kind) DO UPDATE
    SET next_value = GREATEST(id_counters.next_value, EXCLUDED.next_value),
        updated_at = now();

  RETURN v_max + 1;
END;
$$;
