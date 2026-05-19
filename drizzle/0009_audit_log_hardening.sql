-- ============================================================================
-- 0009_audit_log_hardening.sql — Audit-log tamper-evidence (Phase 7.5)
--
-- ADR-0004: cryptographic chain of `audit_log` rows.
--
-- This migration:
--   1. REVOKEs UPDATE, DELETE, TRUNCATE on audit_log from app_runtime, so the
--      runtime role can only INSERT. (UPDATE/DELETE were already revoked in
--      0002_roles.sql; this re-asserts and adds TRUNCATE for completeness.)
--   2. Installs a BEFORE INSERT trigger `audit_log_chain_trg` that:
--        a. Acquires `pg_advisory_xact_lock(hashtext('audit_log_chain'))` to
--           serialize concurrent inserts within their transactions.
--        b. Reads the latest (chain_seq, row_hash) from audit_log.
--        c. Computes the row's `chain_seq = prev_seq + 1`, `prev_hash`, and
--           `row_hash = sha256(prev_hash || actor_user_id || action ||
--                              entity_kind || entity_id || occurred_at ||
--                              payload_canonical_json)`.
--      Pre-genesis rows already in the table (chain_seq IS NULL) are skipped
--      by the verifier; a one-shot backfill script
--      (scripts/backfill-audit-chain.ts) populates them once.
--   3. Records chain activation timestamp in settings as
--      `audit_chain_trigger_activated_at` (does NOT overwrite the pre-existing
--      `audit_chain_genesis_at` seeded in seed.ts / ADR-0004).
--
-- Hash recipe MUST stay in sync with src/lib/server/audit-log/chain.ts.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. REVOKE writes that would break append-only invariant
-- ---------------------------------------------------------------------------
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM app_runtime;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. Hash-chain trigger function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_log_chain_fn() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_prev_seq    integer;
  v_prev_hash   text;
  v_payload     text;
  v_occurred    text;
  v_concat      text;
BEGIN
  -- Refuse any UPDATE/DELETE if somehow invoked on those events (defensive;
  -- this trigger is BEFORE INSERT only, but keep the check for clarity).
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'audit_log is append-only (op=%)', TG_OP;
  END IF;

  -- Serialize concurrent inserts: every transaction that wants to append
  -- to the chain must acquire this advisory lock first. The lock is held
  -- until the transaction ends, so chain_seq stays monotonic.
  PERFORM pg_advisory_xact_lock(hashtext('audit_log_chain'));

  -- Fetch latest chain head (NULL on first insert post-trigger).
  SELECT chain_seq, row_hash
    INTO v_prev_seq, v_prev_hash
    FROM audit_log
   WHERE chain_seq IS NOT NULL
   ORDER BY chain_seq DESC
   LIMIT 1;

  IF v_prev_seq IS NULL THEN
    v_prev_seq := 0;
    v_prev_hash := '';
  END IF;

  -- Canonicalize payload: strip NULL keys, cast to text. NULL payload → '{}'.
  v_payload := COALESCE(jsonb_strip_nulls(NEW.payload)::text, '{}');

  -- Format occurred_at to mirror the TS reference (YYYY-MM-DD"T"HH24:MI:SS.US),
  -- UTC. `US` = microseconds; Postgres timestamps have us precision natively.
  v_occurred := to_char(NEW.occurred_at AT TIME ZONE 'UTC',
                        'YYYY-MM-DD"T"HH24:MI:SS.US');

  v_concat :=
       v_prev_hash
    || '|' || COALESCE(NEW.actor_user_id::text, '\N')
    || '|' || NEW.action::text
    || '|' || NEW.entity_kind::text
    || '|' || COALESCE(NEW.entity_id::text, '\N')
    || '|' || v_occurred
    || '|' || v_payload;

  NEW.chain_seq  := v_prev_seq + 1;
  NEW.prev_hash  := v_prev_hash;
  NEW.row_hash   := encode(digest(v_concat, 'sha256'), 'hex');

  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- pgcrypto provides `digest(text, 'sha256')`. Idempotent.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint

DROP TRIGGER IF EXISTS audit_log_chain_trg ON audit_log;
--> statement-breakpoint

CREATE TRIGGER audit_log_chain_trg
BEFORE INSERT ON audit_log
FOR EACH ROW
EXECUTE FUNCTION audit_log_chain_fn();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. Record activation timestamp (does not touch existing genesis row)
-- ---------------------------------------------------------------------------
INSERT INTO settings (key, value)
VALUES ('audit_chain_trigger_activated_at',
        jsonb_build_object('iso', to_char(now() AT TIME ZONE 'UTC',
                                          'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
ON CONFLICT (key) DO NOTHING;
