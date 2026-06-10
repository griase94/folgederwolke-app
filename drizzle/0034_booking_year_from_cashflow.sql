-- 0034_booking_year_from_cashflow.sql
--
-- Deliverable B1 — canonicalize the Buchungsjahr (`year_of_buchung`) on the
-- three cash-basis tables to derive from the CASH-FLOW date per § 11 EStG
-- (Zufluss-/Abflussprinzip), not from the bookkeeping timestamp gebucht_am:
--
--   expenses  → abfluss_datum
--   income    → geld_eingang_datum
--   donations → zugewendet_am
--   invoices  → UNCHANGED (stays year_for_booking(gebucht_am))
--
-- Authoritative expression (panel-corrected):
--   COALESCE(extract(year FROM <cash_date>)::int, year_for_booking(gebucht_am))
--
-- IMMUTABILITY: `extract(year FROM <date>)` is IMMUTABLE, so it can back a
-- STORED generated column. The `<cash> AT TIME ZONE …` / `::timestamptz` form
-- is only STABLE and a STORED generated column REJECTS it at ADD COLUMN time.
-- The cash columns are already `date` (Europe/Berlin civil date as entered),
-- so a plain `extract(year FROM <date>)` is both correct and immutable.
--
-- This migration is atomic — everything below runs in one transaction (the
-- migrator wraps each migration file). Order matters: the two views and the
-- two CHECK constraints depend on `year_of_buchung`, so they are dropped
-- before the column is dropped, then recreated afterwards.
--
-- The festschreibung trigger function (assert_not_festgeschrieben_fn — the
-- LIVE 0025 version with the Phase 12 invoice payment carve-out) is rewritten
-- so its inline `v_row_year` is computed from the SAME per-table cash
-- expression as the new column. The STORED generated column is NULL inside a
-- BEFORE trigger (PG computes generated columns after BEFORE-row triggers), so
-- the trigger must recompute the year inline. Without this rewrite the legal
-- tamper-evidence control (ADR-0004 / GoBD § 146) would guard the wrong year.
--
-- The two dropped CHECKs:
--   *_business_id_year_ck             — coupled business_id's year segment to
--                                       year_of_buchung. With the cash-year
--                                       semantics a 2025-cash row booked via a
--                                       S-2025 id is now correct, but the
--                                       segment no longer needs to equal the
--                                       (formerly gebucht_am-derived) column.
--   donations_bescheinigung_nr_year_ck — the Zuwendungsbestätigung number's
--                                       year is the ISSUE year, not the EÜR
--                                       cash year; decoupling them.
-- (The *_business_id_format_ck constraints are KEPT — id shape is unchanged.)
-- NB: the expenses year-CHECK dropped here is the 0013 REDEFINITION
-- (substring(business_id from '^(?:A|AUS)-(\d{4})-'), covering both the A- and
-- AUS- prefixes), not the original 0000 substring(... from 3 for 4) form. The
-- DROP CONSTRAINT IF EXISTS below removes it by name, so the runtime shape
-- doesn't matter for correctness — this note just keeps a future reader honest.

-- ---------------------------------------------------------------------------
-- 1. Drop the two views that depend on year_of_buchung.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS v_eur_year;--> statement-breakpoint
DROP VIEW IF EXISTS v_wgb_freigrenze_status;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. Drop the year-coupled CHECK constraints (see header).
-- ---------------------------------------------------------------------------
ALTER TABLE "expenses"  DROP CONSTRAINT IF EXISTS "expenses_business_id_year_ck";--> statement-breakpoint
ALTER TABLE "income"    DROP CONSTRAINT IF EXISTS "income_business_id_year_ck";--> statement-breakpoint
ALTER TABLE "donations" DROP CONSTRAINT IF EXISTS "donations_business_id_year_ck";--> statement-breakpoint
ALTER TABLE "donations" DROP CONSTRAINT IF EXISTS "donations_bescheinigung_nr_year_ck";--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. Recompute year_of_buchung from the cash-flow date, per table.
--    DROP COLUMN cascades the dependent *_year_of_buchung_idx; re-create it.
-- ---------------------------------------------------------------------------

-- expenses → abfluss_datum
ALTER TABLE "expenses" DROP COLUMN "year_of_buchung";--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "year_of_buchung" integer
  GENERATED ALWAYS AS (
    COALESCE(extract(year FROM abfluss_datum)::int, year_for_booking(gebucht_am))
  ) STORED;--> statement-breakpoint
CREATE INDEX "expenses_year_of_buchung_idx" ON "expenses" ("year_of_buchung");--> statement-breakpoint

-- income → geld_eingang_datum
ALTER TABLE "income" DROP COLUMN "year_of_buchung";--> statement-breakpoint
ALTER TABLE "income" ADD COLUMN "year_of_buchung" integer
  GENERATED ALWAYS AS (
    COALESCE(extract(year FROM geld_eingang_datum)::int, year_for_booking(gebucht_am))
  ) STORED;--> statement-breakpoint
CREATE INDEX "income_year_of_buchung_idx" ON "income" ("year_of_buchung");--> statement-breakpoint

-- donations → zugewendet_am
ALTER TABLE "donations" DROP COLUMN "year_of_buchung";--> statement-breakpoint
ALTER TABLE "donations" ADD COLUMN "year_of_buchung" integer
  GENERATED ALWAYS AS (
    COALESCE(extract(year FROM zugewendet_am)::int, year_for_booking(gebucht_am))
  ) STORED;--> statement-breakpoint
CREATE INDEX "donations_year_of_buchung_idx" ON "donations" ("year_of_buchung");--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 4. Recreate the two views (SELECT bodies identical to 0007 / 0008 — only the
--    derived year_of_buchung column changes semantics via §3 above) + re-run
--    the grants. DROP VIEW dropped only the views' OWN grants (the underlying
--    `kategorien` table grant from 0007 is unaffected on a forward chain), but
--    we re-run `GRANT SELECT ON kategorien TO app_export` too (idempotent) so
--    0034 is a faithful, self-contained recreation of 0007's grant surface —
--    a replay onto a DB lacking that grant still leaves app_export correct.
--    v_eur_year keeps the same relevanz_datum/year_of_buchung shape; with the
--    new column it now sorts/filters by the cash year. app_export grant from
--    0007; app_runtime grant from 0017 (without it the gobd-export route 500s).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_eur_year AS
SELECT
  'income'::text            AS art,
  i.business_id,
  i.gebucht_am,
  COALESCE(i.geld_eingang_datum::timestamptz, i.gebucht_am) AS relevanz_datum,
  i.year_of_buchung,
  i.betrag_cents,
  i.bezeichnung,
  i.sphere_snapshot,
  i.kategorie_id,
  i.kategorie_name_snapshot,
  k.eur_zeile,
  k.anlage_gem_zeile,
  i.beleg_drive_file_id,
  i.beleg_original_name,
  i.festgeschrieben_at
FROM income i
LEFT JOIN kategorien k ON k.id = i.kategorie_id

UNION ALL

SELECT
  'expense'::text           AS art,
  e.business_id,
  e.gebucht_am,
  COALESCE(e.abfluss_datum::timestamptz, e.gebucht_am) AS relevanz_datum,
  e.year_of_buchung,
  e.betrag_cents,
  e.bezeichnung,
  COALESCE(e.sphere_override, e.sphere_snapshot) AS sphere_snapshot,
  e.kategorie_id,
  e.kategorie_name_snapshot,
  k.eur_zeile,
  k.anlage_gem_zeile,
  e.beleg_drive_file_id,
  e.beleg_original_name,
  e.festgeschrieben_at
FROM expenses e
LEFT JOIN kategorien k ON k.id = e.kategorie_id;--> statement-breakpoint

GRANT SELECT ON v_eur_year TO app_export;--> statement-breakpoint
GRANT SELECT ON v_eur_year TO app_runtime;--> statement-breakpoint
-- Re-run the underlying kategorien grant from 0007 (idempotent) so 0034 fully
-- reproduces 0007's grant surface. DROP VIEW above did NOT remove this grant
-- on a normal forward chain, but replaying 0034 onto a DB without it must still
-- leave app_export able to SELECT kategorien (the v_eur_year JOIN reads it).
GRANT SELECT ON kategorien TO app_export;--> statement-breakpoint

CREATE OR REPLACE VIEW v_wgb_freigrenze_status AS
SELECT
    year_for_booking(now()) AS current_year,
    COALESCE(SUM(betrag_cents), 0)::bigint AS einnahmen_cents_ytd,
    -- Gross = brutto; income table stores gross (betrag_cents) — invoices
    -- store netto + ust separately, but income.betrag_cents is gross for
    -- wirtschaftlich sphere receipts recorded via the income form.
    4500000::bigint AS freigrenze_cents,  -- 45.000,00 € in cents
    CASE
        WHEN COALESCE(SUM(betrag_cents), 0) >= 4500000 THEN 'ueberschritten'
        WHEN COALESCE(SUM(betrag_cents), 0) >= 3600000 THEN 'kritisch'   -- ≥ 80 %
        WHEN COALESCE(SUM(betrag_cents), 0) >= 2250000 THEN 'erhoeht'    -- ≥ 50 %
        ELSE 'ok'
    END AS status,
    GREATEST(0, 4500000 - COALESCE(SUM(betrag_cents), 0))::bigint AS restbetrag_cents
FROM income
WHERE
    sphere_snapshot = 'wirtschaftlich'
    AND year_of_buchung = year_for_booking(now())
    AND supersedes_id IS NULL;--> statement-breakpoint

COMMENT ON VIEW v_wgb_freigrenze_status IS
    'WGB Kleinunternehmer-Freigrenze §19 UStG: YTD gross Einnahmen (wirtschaftlich sphere) vs 45.000 € limit for current Berlin year.';--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 5. Rewrite assert_not_festgeschrieben_fn so its inline v_row_year matches
--    the new per-table cash-derived column (the STORED column is NULL inside a
--    BEFORE trigger). Everything else — the session_user bypass, the tolerant
--    year extractor, the DELETE/UPDATE/INSERT branching, and the Phase 12
--    invoice payment-column carve-out — is preserved verbatim from 0025.
--
--    Per-table cash expression (matches the column COALESCE):
--      expenses  → abfluss_datum
--      income    → geld_eingang_datum
--      donations → zugewendet_am
--      invoices  → keep year_for_booking(NEW/OLD.gebucht_am)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_not_festgeschrieben_fn() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_frozen_until integer;
  v_row_year     integer;
  v_old_year     integer;
  v_new_year     integer;
BEGIN
  -- Enforce only for the production runtime role. Migrations (run as the
  -- DB owner / app_migrate) and superuser-level admin / fixture seed scripts
  -- need to write historic rows during setup. `session_user` (not
  -- `current_user`) is used because this function is SECURITY DEFINER and
  -- `current_user` is rewritten to the function owner inside the body.
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

  -- ── Per-table cash-derived year (mirrors the STORED column COALESCE) ──────
  -- The STORED generated `year_of_buchung` is NULL inside a BEFORE trigger
  -- (Postgres computes generated columns AFTER BEFORE-row triggers, PG docs
  -- §38.5), so the year is recomputed inline here from the SAME cash-flow
  -- expression as the column. We recompute OLD too so the trigger and the
  -- column are provably in lock-step.
  --
  -- IMPORTANT (PL/pgSQL record-field resolution): each table's cash column
  -- (abfluss_datum / geld_eingang_datum / zugewendet_am) lives ONLY on its own
  -- table. A `CASE TG_TABLE_NAME … NEW.<col> …` expression is rejected at
  -- execution with "record NEW has no field <col>" because PL/pgSQL resolves
  -- EVERY NEW/OLD field reference in the expression against the actual row,
  -- regardless of which CASE branch is selected. So we MUST gate each column
  -- reference behind a `TG_TABLE_NAME`-specific IF branch — only the matching
  -- table's column is ever referenced for a given firing.
  --
  -- v_old_year is the existing row's cash year (NULL on INSERT); v_new_year is
  -- the post-mutation cash year (NULL on DELETE). For UPDATE we check BOTH so
  -- moving a row into OR out of a closed year is rejected (rebucket guard).
  IF TG_OP <> 'INSERT' THEN  -- OLD is populated for UPDATE + DELETE
    IF TG_TABLE_NAME = 'expenses' THEN
      v_old_year := COALESCE(extract(year FROM OLD.abfluss_datum)::int, public.year_for_booking(OLD.gebucht_am));
    ELSIF TG_TABLE_NAME = 'income' THEN
      v_old_year := COALESCE(extract(year FROM OLD.geld_eingang_datum)::int, public.year_for_booking(OLD.gebucht_am));
    ELSIF TG_TABLE_NAME = 'donations' THEN
      v_old_year := COALESCE(extract(year FROM OLD.zugewendet_am)::int, public.year_for_booking(OLD.gebucht_am));
    ELSE  -- invoices + any other table on this trigger
      v_old_year := public.year_for_booking(OLD.gebucht_am);
    END IF;
  END IF;

  IF TG_OP <> 'DELETE' THEN  -- NEW is populated for INSERT + UPDATE
    IF TG_TABLE_NAME = 'expenses' THEN
      v_new_year := COALESCE(extract(year FROM NEW.abfluss_datum)::int, public.year_for_booking(NEW.gebucht_am));
    ELSIF TG_TABLE_NAME = 'income' THEN
      v_new_year := COALESCE(extract(year FROM NEW.geld_eingang_datum)::int, public.year_for_booking(NEW.gebucht_am));
    ELSIF TG_TABLE_NAME = 'donations' THEN
      v_new_year := COALESCE(extract(year FROM NEW.zugewendet_am)::int, public.year_for_booking(NEW.gebucht_am));
    ELSE  -- invoices + any other table on this trigger
      v_new_year := public.year_for_booking(NEW.gebucht_am);
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_row_year := v_old_year;
  ELSIF TG_OP = 'UPDATE' THEN
    v_row_year := LEAST(
      COALESCE(v_old_year, 999999),
      COALESCE(v_new_year, 999999)
    );
    IF v_row_year = 999999 THEN v_row_year := NULL; END IF;
  ELSE  -- INSERT
    v_row_year := v_new_year;
  END IF;

  IF v_row_year IS NOT NULL AND v_row_year <= v_frozen_until THEN
    -- ── Phase 12 carve-out (§ 11 EStG Zufluss) ───────────────────────────
    -- On invoices: permit UPDATEs whose only changed columns are
    -- {bezahlt_am, paid_by_income_id, updated_at}. The PAYMENT year, not
    -- the invoice year, is what § 11 EStG keys on; the invoice's own
    -- Buchungsjahr may already be festgeschrieben at payment time. All
    -- substantive fields (Bezeichnung, Beträge, Kunde, Daten, PDF-Verweise)
    -- remain locked — only the payment-reconciliation columns can move.
    IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'invoices' THEN
      IF NEW.id                          IS NOT DISTINCT FROM OLD.id
         AND NEW.business_id              IS NOT DISTINCT FROM OLD.business_id
         AND NEW.source                   IS NOT DISTINCT FROM OLD.source
         AND NEW.source_ref               IS NOT DISTINCT FROM OLD.source_ref
         AND NEW.gebucht_am               IS NOT DISTINCT FROM OLD.gebucht_am
         AND NEW.rechnungsdatum           IS NOT DISTINCT FROM OLD.rechnungsdatum
         AND NEW.leistungs_datum          IS NOT DISTINCT FROM OLD.leistungs_datum
         AND NEW.faelligkeits_datum       IS NOT DISTINCT FROM OLD.faelligkeits_datum
         AND NEW.customer_id              IS NOT DISTINCT FROM OLD.customer_id
         AND NEW.customer_name_snapshot   IS NOT DISTINCT FROM OLD.customer_name_snapshot
         AND NEW.customer_address_snapshot IS NOT DISTINCT FROM OLD.customer_address_snapshot
         AND NEW.project_id               IS NOT DISTINCT FROM OLD.project_id
         AND NEW.netto_cents              IS NOT DISTINCT FROM OLD.netto_cents
         AND NEW.ust_cents                IS NOT DISTINCT FROM OLD.ust_cents
         AND NEW.brutto_cents             IS NOT DISTINCT FROM OLD.brutto_cents
         AND NEW.currency                 IS NOT DISTINCT FROM OLD.currency
         AND NEW.kategorie_id             IS NOT DISTINCT FROM OLD.kategorie_id
         AND NEW.kategorie_name_snapshot  IS NOT DISTINCT FROM OLD.kategorie_name_snapshot
         AND NEW.sphere_snapshot          IS NOT DISTINCT FROM OLD.sphere_snapshot
         AND NEW.bezeichnung              IS NOT DISTINCT FROM OLD.bezeichnung
         AND NEW.leistungs_beschreibung   IS NOT DISTINCT FROM OLD.leistungs_beschreibung
         AND NEW.leistungszeitraum        IS NOT DISTINCT FROM OLD.leistungszeitraum
         AND NEW.pdf_status               IS NOT DISTINCT FROM OLD.pdf_status
         AND NEW.pdf_status_error         IS NOT DISTINCT FROM OLD.pdf_status_error
         AND NEW.pdf_file_id              IS NOT DISTINCT FROM OLD.pdf_file_id
         AND NEW.festgeschrieben_at       IS NOT DISTINCT FROM OLD.festgeschrieben_at
         AND NEW.festgeschrieben_by_user_id IS NOT DISTINCT FROM OLD.festgeschrieben_by_user_id
         AND NEW.supersedes_id            IS NOT DISTINCT FROM OLD.supersedes_id
         AND NEW.created_at               IS NOT DISTINCT FROM OLD.created_at
         AND NEW.created_by_user_id       IS NOT DISTINCT FROM OLD.created_by_user_id
      THEN
        -- Only bezahlt_am, paid_by_income_id, and/or updated_at may differ.
        RETURN NEW;
      END IF;
    END IF;

    RAISE EXCEPTION
      'Festgeschriebenes Buchungsjahr %: % auf Tabelle % nicht zulässig (festgeschrieben_bis=%)',
      v_row_year, TG_OP, TG_TABLE_NAME, v_frozen_until
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
