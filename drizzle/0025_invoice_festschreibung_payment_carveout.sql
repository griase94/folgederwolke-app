-- Phase 12 — Festschreibung trigger carve-out for invoice payment columns.
--
-- The row-level UPDATE/DELETE/INSERT trigger `assert_not_festgeschrieben_trg`
-- (function `public.assert_not_festgeschrieben_fn` — see 0014_critical_hardening
-- §1a) currently blocks ALL UPDATEs on rows whose Buchungsjahr is at or below
-- `settings.festgeschrieben_bis`.
--
-- Mark-as-paid needs to UPDATE `bezahlt_am` + `paid_by_income_id` on the
-- invoice row. The relevant Buchungsjahr per § 11 EStG (Zufluss-/Abflussprinzip)
-- is the PAYMENT year, NOT the invoice's own `gebucht_am` year — a Rechnung
-- issued in 2025-12 paid in 2026-01 booked into 2026, and 2025 may already be
-- festgeschrieben.
--
-- Carve-out: when the table is `invoices` and the UPDATE touches ONLY the
-- column set {bezahlt_am, paid_by_income_id, updated_at} (every other column
-- byte-equal to OLD), the trigger lets the UPDATE through even on
-- festgeschriebene rows. All substantive fields (Bezeichnung, Beträge, Kunde,
-- Datums, PDF-Verweise, …) remain locked.
--
-- The carve-out is column-set-specific. Setting `bezahlt_am` back to NULL is
-- a payment-column change too, so undo-payment (same-day window in app code)
-- also passes — desired.
--
-- NOTE: this only affects the public.assert_not_festgeschrieben_fn function.
-- The same function is shared by income, expenses, donations — for those
-- TG_TABLE_NAME branches the original behaviour is preserved.

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
