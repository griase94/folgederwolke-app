-- 0014_critical_hardening.sql
--
-- Three DB-level fixes from the 2026-05-20 production audit:
--
--   1. (C1) Festschreibung trigger now covers INSERT — not just UPDATE/DELETE.
--      Before this, the only thing blocking inserts into a festgeschriebenes
--      year was the in-app `checkFestschreibungGate()` helper. Anyone with
--      direct DB access (or an app code path that forgets the gate) could
--      retroactively add bookings to a closed year — a GoBD § 146 violation.
--      Also: the original trigger function (added in 0010) expected
--      `settings.value` for `festgeschrieben_bis` to be a JSON object
--      (`{"year": 2025}`), but the app actually persists a bare number or
--      string. The mismatch meant the trigger silently short-circuited and
--      never enforced. This migration rebuilds the function with a tolerant
--      parser so the trigger actually fires.
--
--   2. (C3) Settings.festgeschrieben_bis monotonic enforcement. Festschreibung
--      must be monotonic forward — once a year is closed it cannot be
--      reopened. A compromised app_runtime with raw SQL could otherwise
--      `UPDATE settings SET value=2020 WHERE key='festgeschrieben_bis'` and
--      then mutate previously-locked years (combined with bug #1).
--
--   3. (C5) donations.bescheinigung_nr year-consistency CHECK. Bescheinigungs-
--      Nummern are user-entered. Without a year_ck, an admin can save
--      `B-2024-001` on a 2025 donation, which the Finanzamt rejects.
--
-- Bypass policy (both triggers):
--   `session_user <> 'app_runtime'` short-circuits to no-op. Local dev +
--   test runs as `app_runtime` (per .env.development/.env.test) and so are
--   enforced. Postgres superuser bypasses (migrations, fixture seeds,
--   reset-test-db.sh teardown).
--
--   PROD CAVEAT (Neon): the project's CLAUDE.md states all app roles are
--   NOLOGIN in Neon, with Neon managing the connection auth itself. We
--   assume Neon's compute-role mapping presents `session_user='app_runtime'`
--   to the trigger. Verify by querying `SELECT session_user` from a prod
--   function once and confirm the value before relying on enforcement. If
--   the prod role name differs, a follow-up migration should switch this
--   guard to a session-variable opt-in (`SET app.bypass_festschreibung`)
--   that migrations + seeds explicitly set, so app_runtime is always
--   enforced regardless of the effective role name.

-- ----------------------------------------------------------------------------
-- 0. Shared helper: tolerant jsonb→integer year extractor
-- ----------------------------------------------------------------------------
-- The app persists `settings.value` for `festgeschrieben_bis` as either a
-- bare JSON number (`2025`), a quoted JSON string (`"2025"`), or — in older
-- design notes — a JSON object (`{"year": 2025}`). Both triggers in this
-- migration need to read the year regardless of which shape is on disk.

CREATE OR REPLACE FUNCTION public._festgeschrieben_extract_year(v jsonb)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_str text;
BEGIN
  IF v IS NULL OR jsonb_typeof(v) = 'null' THEN
    RETURN NULL;
  END IF;
  -- Pull the text representation per shape, then validate it's a plausible
  -- 4-digit year before casting. This keeps the function liberal in what it
  -- accepts (matching what the app's `fetchFestgeschriebenBis` parses) while
  -- still surfacing genuinely corrupt data (non-numeric strings, dates) as
  -- NULL rather than a fabricated year.
  v_str := CASE jsonb_typeof(v)
    WHEN 'number' THEN v#>>'{}'
    WHEN 'string' THEN v#>>'{}'
    WHEN 'object' THEN v->>'year'
    ELSE NULL
  END;
  IF v_str IS NULL OR v_str !~ '^-?\d{1,9}$' THEN
    RETURN NULL;
  END IF;
  RETURN v_str::integer;
END;
$$;
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 1a. Rebuild assert_not_festgeschrieben_fn with the tolerant parser
-- ----------------------------------------------------------------------------
-- The original function (0010_post_review_hardening.sql:217) read
-- `(value->>'year')::integer`, assuming the object shape only. The skipped
-- tests in `tests/unit/c1-festschreibung-trigger.test.ts` pin this exact bug.

CREATE OR REPLACE FUNCTION public.assert_not_festgeschrieben_fn() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_frozen_until integer;
  v_row_year     integer;
BEGIN
  -- Enforce only for the production runtime role. Migrations (run as the
  -- DB owner / app_migrate) and superuser-level admin / fixture seed scripts
  -- need to write historic rows during setup. `session_user` (not
  -- `current_user`) is used because this function is SECURITY DEFINER and
  -- `current_user` is rewritten to the function owner inside the body.
  -- Tests asserting the trigger fires must connect via DATABASE_URL
  -- (app_runtime) not DIRECT_DATABASE_URL (postgres).
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

  -- year_of_buchung is a STORED GENERATED column. Postgres computes
  -- generated columns AFTER BEFORE-row triggers (PG docs §38.5), so
  -- NEW.year_of_buchung is always NULL inside a BEFORE INSERT/UPDATE
  -- trigger. Call year_for_booking() inline on NEW.gebucht_am instead.
  -- OLD's generated column IS populated (it was filled on the prior
  -- INSERT/UPDATE that put the row on disk).
  --
  -- For UPDATE we check BOTH sides: the existing row's year (OLD) and
  -- the year gebucht_am would move it to (NEW). If either is at or below
  -- the festschreibung lock, the mutation is rejected.
  IF TG_OP = 'DELETE' THEN
    v_row_year := OLD.year_of_buchung;
  ELSIF TG_OP = 'UPDATE' THEN
    v_row_year := LEAST(
      COALESCE(OLD.year_of_buchung, 999999),
      COALESCE(public.year_for_booking(NEW.gebucht_am), 999999)
    );
    IF v_row_year = 999999 THEN v_row_year := NULL; END IF;
  ELSE  -- INSERT
    v_row_year := public.year_for_booking(NEW.gebucht_am);
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

-- ----------------------------------------------------------------------------
-- 1b. Extend the trigger to cover INSERT (not just UPDATE/DELETE)
-- ----------------------------------------------------------------------------
-- Once the function actually works (1a above), wire up INSERT so retroactive
-- bookings into closed years are rejected at the DB layer regardless of which
-- code path attempts the write.

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
         BEFORE INSERT OR UPDATE OR DELETE ON %I
         FOR EACH ROW EXECUTE FUNCTION public.assert_not_festgeschrieben_fn()',
      t
    );
  END LOOP;
END;
$$;
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 2. Monotonic-forward enforcement for settings.festgeschrieben_bis
-- ----------------------------------------------------------------------------
-- Allow forward UPDATEs only; reject any attempt to lower the year or DELETE
-- the row.

CREATE OR REPLACE FUNCTION public.assert_festgeschrieben_bis_monotonic_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_old_year integer;
  v_new_year integer;
BEGIN
  -- Enforce only for the production runtime role (see assert_not_festgeschrieben_fn
  -- above for rationale + the Neon-role caveat). Tests verifying this trigger
  -- fires must connect via DATABASE_URL (app_runtime).
  IF session_user <> 'app_runtime' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Only enforce on the festgeschrieben_bis row; other settings unaffected.
  IF TG_OP = 'DELETE' THEN
    IF OLD.key = 'festgeschrieben_bis' THEN
      RAISE EXCEPTION
        'settings.festgeschrieben_bis darf nicht gelöscht werden (Festschreibung ist endgültig)'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE path. Block rename of the festgeschrieben_bis row to a different
  -- key (which would otherwise be a back-door to "unfreeze" by renaming away
  -- the lock row and then re-inserting a fresh one with a lower year).
  IF OLD.key = 'festgeschrieben_bis' AND NEW.key <> 'festgeschrieben_bis' THEN
    RAISE EXCEPTION
      'settings.festgeschrieben_bis darf nicht umbenannt werden (alt=%, neu=%)',
      OLD.key, NEW.key
      USING ERRCODE = 'check_violation';
  END IF;

  -- For UPDATEs of other settings rows, the trigger is a no-op.
  IF NEW.key <> 'festgeschrieben_bis' THEN
    RETURN NEW;
  END IF;

  v_old_year := public._festgeschrieben_extract_year(OLD.value);
  v_new_year := public._festgeschrieben_extract_year(NEW.value);

  -- Going from NULL to a value is allowed (first-ever Festschreibung).
  IF v_old_year IS NULL THEN
    RETURN NEW;
  END IF;

  -- Forward-only.
  IF v_new_year IS NULL OR v_new_year < v_old_year THEN
    RAISE EXCEPTION
      'festgeschrieben_bis darf nur vorwärts (monoton steigend) gesetzt werden (alt=%, neu=%)',
      v_old_year, v_new_year
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS assert_festgeschrieben_bis_monotonic_trg ON public.settings;--> statement-breakpoint
CREATE TRIGGER assert_festgeschrieben_bis_monotonic_trg
  BEFORE UPDATE OR DELETE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.assert_festgeschrieben_bis_monotonic_fn();
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 3. donations.bescheinigung_nr year-consistency CHECK
-- ----------------------------------------------------------------------------
-- The format check (added in 0000_init.sql) only validates the `B-YYYY-NNN`
-- shape. The year must also match the donation's Buchungsjahr — otherwise
-- the receipt is tax-invalid. Add a parallel year-check using the same
-- regex-capture pattern used by 0013 for expenses.

ALTER TABLE "donations" DROP CONSTRAINT IF EXISTS "donations_bescheinigung_nr_year_ck";--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_bescheinigung_nr_year_ck"
  CHECK (
    bescheinigung_nr IS NULL
    OR (substring(bescheinigung_nr from '^B-(\d{4})-'))::int = year_of_buchung
  );
