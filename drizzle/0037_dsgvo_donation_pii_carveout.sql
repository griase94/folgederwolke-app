-- F31 — Festschreibung trigger carve-out for DSGVO donor-PII erasure.
--
-- GDPR Art. 17 (Recht auf Löschung) requires a donor's personal data to be
-- erased on request. §147 AO requires the donation's financial record
-- (amounts, dates, Buchungsjahr) to be retained for 10 years and frozen once
-- the year is festgeschrieben (ADR-0006). pseudonymise() in
-- src/lib/server/domain/dsgvo.ts reconciles the two by NULLing only the donor
-- PII columns (spender_name, spender_adresse, spender_email) while keeping the
-- financial fields.
--
-- BUT the row-level trigger assert_not_festgeschrieben_trg (function
-- public.assert_not_festgeschrieben_fn — 0014_critical_hardening §1a, extended
-- for invoices in 0025) blocks ALL UPDATEs on a donation whose Buchungsjahr is
-- festgeschrieben. So an erasure for a donor with any donation in a closed year
-- threw 23514, aborted the WHOLE pseudonymise transaction, and silently erased
-- nothing (member PII, user/session, mails all rolled back too).
--
-- Carve-out: when the table is `donations` and the UPDATE sets the three PII
-- columns to NULL while leaving every financially-material column unchanged,
-- the trigger lets the UPDATE through even on festgeschriebene rows. This is the
-- exact, minimal permission GDPR erasure needs; all §147-AO-relevant fields
-- (business_id, amounts, dates, year-driving columns, kategorie/sphere,
-- festschreibung, supersedes-chain, Bescheinigung) stay locked.
--
-- Mirrors the invoices payment-column carve-out in 0025. The income/expenses
-- TG_TABLE_NAME branches keep the original (fully-locked) behaviour.

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
    -- ── Phase 12 carve-out (§ 11 EStG Zufluss) — invoices payment columns ──
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

    -- ── F31 carve-out (GDPR Art. 17) — donations donor-PII erasure ─────────
    -- Permit an UPDATE that NULLs the three donor-PII columns while leaving
    -- every financially-material column byte-equal to OLD. The PII columns
    -- MUST be NULL in NEW (this is an erasure, not an edit); only redaction —
    -- not arbitrary mutation — is allowed on a festgeschriebene Spende.
    IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'donations' THEN
      IF NEW.spender_name    IS NULL
         AND NEW.spender_adresse IS NULL
         AND NEW.spender_email   IS NULL
         -- §147-AO-material columns frozen:
         AND NEW.id                          IS NOT DISTINCT FROM OLD.id
         AND NEW.business_id                 IS NOT DISTINCT FROM OLD.business_id
         AND NEW.source                      IS NOT DISTINCT FROM OLD.source
         AND NEW.source_ref                  IS NOT DISTINCT FROM OLD.source_ref
         AND NEW.gebucht_am                  IS NOT DISTINCT FROM OLD.gebucht_am
         AND NEW.zugewendet_am               IS NOT DISTINCT FROM OLD.zugewendet_am
         AND NEW.betrag_cents                IS NOT DISTINCT FROM OLD.betrag_cents
         AND NEW.currency                    IS NOT DISTINCT FROM OLD.currency
         AND NEW.member_id                   IS NOT DISTINCT FROM OLD.member_id
         AND NEW.spende_kind                 IS NOT DISTINCT FROM OLD.spende_kind
         AND NEW.zweckbindung_kind           IS NOT DISTINCT FROM OLD.zweckbindung_kind
         AND NEW.zweckbindung_text           IS NOT DISTINCT FROM OLD.zweckbindung_text
         AND NEW.kategorie_id                IS NOT DISTINCT FROM OLD.kategorie_id
         AND NEW.kategorie_name_snapshot     IS NOT DISTINCT FROM OLD.kategorie_name_snapshot
         AND NEW.sphere_snapshot             IS NOT DISTINCT FROM OLD.sphere_snapshot
         AND NEW.project_id                  IS NOT DISTINCT FROM OLD.project_id
         AND NEW.bescheinigung_nr            IS NOT DISTINCT FROM OLD.bescheinigung_nr
         AND NEW.bescheinigung_ausgestellt_am IS NOT DISTINCT FROM OLD.bescheinigung_ausgestellt_am
         AND NEW.bescheid_typ                IS NOT DISTINCT FROM OLD.bescheid_typ
         AND NEW.beleg_file_id               IS NOT DISTINCT FROM OLD.beleg_file_id
         AND NEW.bescheinigung_file_id       IS NOT DISTINCT FROM OLD.bescheinigung_file_id
         AND NEW.festgeschrieben_at          IS NOT DISTINCT FROM OLD.festgeschrieben_at
         AND NEW.festgeschrieben_by_user_id  IS NOT DISTINCT FROM OLD.festgeschrieben_by_user_id
         AND NEW.supersedes_id               IS NOT DISTINCT FROM OLD.supersedes_id
         AND NEW.created_at                  IS NOT DISTINCT FROM OLD.created_at
         AND NEW.created_by_user_id          IS NOT DISTINCT FROM OLD.created_by_user_id
      THEN
        -- Only the PII columns (now NULL) and updated_at may differ.
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
