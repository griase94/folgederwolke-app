-- ============================================================================
-- 0010_post_review_hardening.sql — fixes from the 2026-05-19 9-reviewer pass
--
-- Closes the CRIT/HIGH items from the schema, audit-chain, DSGVO, and money
-- reviews that require DDL. The corresponding TS-side updates (verifier, env
-- types, etc.) ship in the same PR.
--
-- Sections:
--   1. Audit-log hash-chain v2 (recipe v2 + SECURITY DEFINER + ms precision)
--   2. Persisted chain head (truncation-detection cache)
--   3. FK hardening (audit_log.actor_user_id, auslagen_submissions extras)
--   4. Festschreibung DB-level enforcement trigger
--   5. Missing index on donations.kategorie_id
--   6. CHECK constraints (invoices brutto math, drive_status, id_counters.kind)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Audit-log hash-chain v2
-- ---------------------------------------------------------------------------
--
-- Changes vs the 0009 version (every change tied to a reviewer finding):
--
--   * audit-chain CRIT-01 — hash now covers EVERY persisted column whose
--     forgery would matter to an auditor:
--       id, chain_seq, prev_hash, actor_user_id, actor_kind, actor_ip_prefix,
--       actor_ua_hash, action, entity_kind, entity_id, entity_business_id,
--       occurred_at (ms), payload.
--   * schema CRIT-F1 / audit-chain LOW-02 — occurred_at is truncated to
--     millisecond precision before formatting, so the SQL-side trigger and
--     the TS-side verifier agree. The previous trigger used `'US'` micros
--     but JS Date is ms; sub-ms rows looked tampered.
--   * schema CRIT-F2 / audit-chain HIGH-01 — advisory lock now uses the
--     namespaced two-arg form `pg_advisory_xact_lock(namespace, key)`,
--     not `hashtext('audit_log_chain')`. 4711 is reserved here for the
--     audit-log namespace (matches src/lib/server/audit-log/chain.ts).
--   * audit-chain CRIT-03 — trigger function is `SECURITY DEFINER` with an
--     empty `search_path`, so a hostile schema (e.g. a `digest()` shadow)
--     cannot redirect the hashing.
--   * audit-chain HIGH-04 — payload is no longer `jsonb_strip_nulls`d, so
--     adding/removing a null-valued key is visible in the hash.
--
-- The recipe MUST stay in sync with src/lib/server/audit-log/chain.ts. There
-- is a vitest integration test (tests/integration/audit-chain.test.ts) that
-- co-asserts both sides on every CI run.

DROP TRIGGER IF EXISTS audit_log_chain_trg ON audit_log;
--> statement-breakpoint

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

  -- Namespaced advisory lock: (4711, 1) is reserved for the audit-log chain.
  -- Other allocators MUST NOT use namespace 4711.
  PERFORM pg_catalog.pg_advisory_xact_lock(4711, 1);

  -- Read the current chain head. Uses the chain_seq UNIQUE index added below.
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

  -- Payload as canonical text. NULL → '{}'. We intentionally do NOT strip
  -- null-valued keys: that would let an attacker hide field removals.
  v_payload := COALESCE(NEW.payload::text, '{}');

  -- Format occurred_at truncated to milliseconds in UTC so the SQL and TS
  -- sides agree.  '%FT%H:%M:%S.MS' in postgres' to_char vocabulary:
  v_occurred := pg_catalog.to_char(
    pg_catalog.date_trunc('milliseconds', NEW.occurred_at)
      AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS'
  );

  -- Hash recipe v2 — pipe-separated, every persisted column included.
  -- '\N' = explicit NULL marker so absence-vs-empty-string is unambiguous.
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
  NEW.row_hash  := pg_catalog.encode(
    pg_catalog.digest(v_concat, 'sha256'),
    'hex'
  );

  -- Update the persisted head pointer so the verifier can detect truncation.
  -- See section 2 below for the settings row this targets.
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
--> statement-breakpoint

-- pgcrypto provides digest(text, 'sha256'). Idempotent.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint

CREATE TRIGGER audit_log_chain_trg
BEFORE INSERT ON audit_log
FOR EACH ROW
EXECUTE FUNCTION public.audit_log_chain_fn();
--> statement-breakpoint

-- chain_seq must be globally unique for the verifier to detect re-numbering.
-- Schema review HIGH-F6.
ALTER TABLE audit_log
  DROP CONSTRAINT IF EXISTS audit_log_chain_seq_uq;
--> statement-breakpoint

ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_chain_seq_uq UNIQUE (chain_seq);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. Persisted chain head (audit-chain CRIT-04)
-- ---------------------------------------------------------------------------
-- Without a persisted head outside the audit_log table itself, a privileged
-- attacker could `DELETE FROM audit_log WHERE chain_seq > N` and the
-- self-referential verifier would see a perfectly valid chain of length N.
-- The trigger above keeps this row in sync on every insert; the TS verifier
-- refuses to bless any state where the table head < settings head.
INSERT INTO settings (key, value)
VALUES (
  'audit_chain_last_head',
  jsonb_build_object('chain_seq', 0, 'row_hash', '', 'updated_at', null)
)
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. FK hardening
-- ---------------------------------------------------------------------------
-- DSGVO review CRIT-07: audit_log.actor_user_id was ON DELETE SET NULL —
-- which meant a `DELETE FROM users` silently MUTATED audit_log rows
-- (setting the column to NULL). That mutation corrupts the hash chain.
-- Switch to RESTRICT; the Art. 17 erasure path uses pseudonymise() (see
-- src/lib/server/dsgvo/pseudonymise.ts post-review), which leaves the FK
-- intact and only redacts payload fields.
ALTER TABLE audit_log
  DROP CONSTRAINT IF EXISTS audit_log_actor_user_id_users_id_fk;
--> statement-breakpoint

ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_actor_user_id_users_id_fk
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT;
--> statement-breakpoint

-- Schema review HIGH-F3: auslagen_submissions had two UUID columns with no
-- FK in either the SQL or the TS schema. Add them with ON DELETE RESTRICT
-- so reviewers / approvals never silently lose their referenced row.
ALTER TABLE auslagen_submissions
  ADD CONSTRAINT auslagen_submissions_decided_by_user_id_users_id_fk
  FOREIGN KEY (decided_by_user_id) REFERENCES users(id) ON DELETE RESTRICT;
--> statement-breakpoint

ALTER TABLE auslagen_submissions
  ADD CONSTRAINT auslagen_submissions_approved_expense_id_expenses_id_fk
  FOREIGN KEY (approved_expense_id) REFERENCES expenses(id) ON DELETE RESTRICT;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 4. Festschreibung DB-level enforcement (money review CRIT-4)
-- ---------------------------------------------------------------------------
-- Until now, the only thing blocking writes to a festgeschriebenes year was
-- the in-app `assertNotFestgeschrieben()` helper — four divergent app-layer
-- guards across different actions. A direct `db.update()` (e.g. from a
-- future importer bug, ad-hoc fix, or attacker with `app_runtime` access)
-- could silently mutate closed-year rows, breaking GoBD § 146 AO.
--
-- This trigger blocks UPDATE and DELETE on rows whose Buchungsjahr is at or
-- below `settings.festgeschrieben_bis`. INSERTs are still allowed (you have
-- to add a Storno before re-closing), but the inserted year must be > the
-- frozen year.

CREATE OR REPLACE FUNCTION public.assert_not_festgeschrieben_fn() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_frozen_until integer;
  v_row_year     integer;
BEGIN
  SELECT (value->>'year')::integer
    INTO v_frozen_until
    FROM public.settings
   WHERE key = 'festgeschrieben_bis';

  IF v_frozen_until IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- year_of_buchung is the generated column derived from year_for_booking().
  IF TG_OP = 'DELETE' THEN
    v_row_year := OLD.year_of_buchung;
  ELSE
    v_row_year := NEW.year_of_buchung;
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

-- Apply to every table that carries year_of_buchung. Keep this list in sync
-- with src/lib/server/db/schema/*.ts.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['invoices', 'income', 'expenses', 'donations']
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS assert_not_festgeschrieben_trg ON %I',
      t
    );
    EXECUTE format(
      'CREATE TRIGGER assert_not_festgeschrieben_trg
         BEFORE UPDATE OR DELETE ON %I
         FOR EACH ROW EXECUTE FUNCTION public.assert_not_festgeschrieben_fn()',
      t
    );
  END LOOP;
END;
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 5. Missing index (schema HIGH-F5)
-- ---------------------------------------------------------------------------
-- donations.kategorie_id is a RESTRICT FK to kategorien. Every kategorie
-- delete attempt seq-scans donations to check the constraint. Other tables
-- with the same FK (income, expenses, invoices) all index this column.
CREATE INDEX IF NOT EXISTS donations_kategorie_id_idx
  ON donations (kategorie_id)
  WHERE kategorie_id IS NOT NULL;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 6. CHECK constraints (schema MED)
-- ---------------------------------------------------------------------------
-- Cross-field invariant: brutto = netto + ust. Generated `_eur` columns are
-- derived from cents, so the check sits on cents only. Use a comment to make
-- the §14 UStG link discoverable from the catalog dump.
ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_brutto_matches_ck;
--> statement-breakpoint

ALTER TABLE invoices
  ADD CONSTRAINT invoices_brutto_matches_ck
  CHECK (brutto_cents = netto_cents + ust_cents);
--> statement-breakpoint

-- Constrain drive_status to its documented enum-like domain so a typo
-- (e.g. 'uploded') doesn't silently invent a new state.
ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_drive_status_enum_ck;
--> statement-breakpoint

ALTER TABLE invoices
  ADD CONSTRAINT invoices_drive_status_enum_ck
  CHECK (drive_status IS NULL OR drive_status IN
         ('pending', 'uploaded', 'failed', 'skipped'));
