-- ============================================================================
-- 0011_audit_trigger_digest_path_fix.sql
--
-- 0010 set the audit_log_chain trigger function to `SET search_path = ''` for
-- defence-in-depth (audit-chain CRIT-03), and qualified every name with the
-- catalog schema. But `digest()` is provided by pgcrypto and lives in
-- `public`, not `pg_catalog` — so the trigger compiled fine but every INSERT
-- raised `function pg_catalog.digest(text, unknown) does not exist`.
--
-- Fix: qualify digest() with `public.` (its real schema), and keep
-- `SET search_path = ''` so a hostile schema cannot still shadow other
-- helpers. encode() is genuinely in pg_catalog, so it stays qualified that
-- way. now() / date_trunc / jsonb_build_object are all in pg_catalog.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.audit_log_chain_fn() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_prev_seq  integer;
  v_prev_hash text;
  v_payload   text;
  v_occurred  text;
  v_concat    text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'audit_log is append-only (op=%)', TG_OP;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(4711, 1);

  SELECT chain_seq, row_hash
    INTO v_prev_seq, v_prev_hash
    FROM public.audit_log
   WHERE chain_seq IS NOT NULL
   ORDER BY chain_seq DESC
   LIMIT 1;

  IF v_prev_seq IS NULL THEN
    v_prev_seq  := 0;
    v_prev_hash := '';
  END IF;

  v_payload := COALESCE(NEW.payload::text, '{}');

  v_occurred := pg_catalog.to_char(
    pg_catalog.date_trunc('milliseconds', NEW.occurred_at)
      AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS'
  );

  v_concat :=
       v_prev_hash
    || '|' || NEW.id::text
    || '|' || (v_prev_seq + 1)::text
    || '|' || COALESCE(NEW.actor_user_id::text, '\N')
    || '|' || COALESCE(NEW.actor_kind::text, '\N')
    || '|' || COALESCE(NEW.actor_ip_prefix, '\N')
    || '|' || COALESCE(NEW.actor_ua_hash, '\N')
    || '|' || NEW.action::text
    || '|' || NEW.entity_kind::text
    || '|' || COALESCE(NEW.entity_id::text, '\N')
    || '|' || COALESCE(NEW.entity_business_id, '\N')
    || '|' || v_occurred
    || '|' || v_payload;

  NEW.chain_seq := v_prev_seq + 1;
  NEW.prev_hash := v_prev_hash;
  -- digest() lives in `public` (installed by pgcrypto in 0009). encode() is
  -- pg_catalog. Fully qualify both so `search_path = ''` resolves them.
  NEW.row_hash  := pg_catalog.encode(
    public.digest(v_concat, 'sha256'),
    'hex'
  );

  UPDATE public.settings
     SET value = pg_catalog.jsonb_build_object(
                   'chain_seq', NEW.chain_seq,
                   'row_hash',  NEW.row_hash,
                   'updated_at', pg_catalog.to_char(
                                   pg_catalog.now() AT TIME ZONE 'UTC',
                                   'YYYY-MM-DD"T"HH24:MI:SS"Z"'
                                 )
                 )
   WHERE key = 'audit_chain_last_head';

  RETURN NEW;
END;
$$;

-- Same fix for the festschreibung trigger function (no digest call, but it
-- also uses pg_catalog.* — leave that alone, just keep the definition stable
-- so this migration replaces 0010's installer atomically).
