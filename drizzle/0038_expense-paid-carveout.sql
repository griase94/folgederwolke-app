-- ADR-0006 Nachtrag — Post-Festschreibung carve-outs for PAYMENT + CERTIFICATE
-- metadata (expenses + donations). Sibling of the invoice payment carve-out
-- (0025) and the DSGVO donor-PII erasure carve-out (F31 / 0037).
--
-- § 11 EStG (Zufluss-/Abflussprinzip): the Buchungsjahr of a reimbursement is
-- the PAYMENT year, not the expense's own year — a December-Auslage paid in
-- January books into the new year while the old year may already be
-- festgeschrieben. Analogously, a Zuwendungsbestätigung is issued (given a
-- B-Nummer + Ausstellungs-Metadaten) potentially AFTER the donation's year was
-- closed — issuance writes only certificate metadata, never a booking value.
--
-- TWO new carve-outs, ADDED to the existing function; income + invoices + the
-- F31 donor-PII branch keep their behaviour BYTE-FOR-BYTE:
--
--   (a) expenses: permit an UPDATE whose only changed columns are
--       {erstattet_am, zahlungsart_id, status, updated_at}. Every substantive
--       AND booking field stays locked — CRUCIALLY abfluss_datum (the
--       year_of_buchung driver, migration 0034) is in the locked set, so a
--       Verein-direct expense with NULL abfluss_datum whose mark-as-paid would
--       set abfluss_datum = payment date is STILL BLOCKED (it would move the
--       Buchungsjahr). markExpenseAsPaid preserves an existing abfluss with
--       COALESCE, so member/extern rows (abfluss already set) pass; the app
--       surfaces the blocked Verein-direct case as an honest German 409.
--
--   (b) donations: permit an UPDATE whose only changed columns are
--       {bescheinigung_nr, bescheinigung_ausgestellt_am,
--        bescheinigung_ausgestellt_von_user_id, bescheid_typ, updated_at} —
--       the exact set allocateBescheinigung writes at issuance. All donor PII,
--       financial, Sachspende + Aufwandsspende + Zweckbindung fields stay
--       byte-equal. This branch COEXISTS with the F31 PII-erasure branch (two
--       independent IF blocks in the donations handling; either matching path
--       RETURN NEWs) — a festgeschriebene Spende thus allows EITHER a PII
--       erasure OR a certificate issuance, never an arbitrary edit.
--
-- IMPORTANT (mirrors 0037 review F1): this CREATE OR REPLACE is built on the
-- LIVE 0037 body (booking_year_from_cashflow + invoice carve-out + F31 PII
-- carve-out), preserving the per-table cash-flow-date year derivation. The
-- STORED generated year_of_buchung is NULL inside a BEFORE trigger, so the
-- guarded Buchungsjahr is recomputed inline from the cash date. Reverting to a
-- gebucht_am form would re-open the ADR-0004 / GoBD §146 tamper-evidence hole
-- 0034 closed. income keeps the original fully-locked behaviour.

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
    -- ── Phase 12 carve-out (§ 11 EStG Zufluss) — invoices payment columns ──
    -- Only {bezahlt_am, paid_by_income_id, updated_at} may differ (0025).
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
        RETURN NEW;
      END IF;
    END IF;

    -- ── ADR-0006 Nachtrag (a) — expenses payment columns ───────────────────
    -- Only {erstattet_am, zahlungsart_id, status, updated_at} may differ. Every
    -- other column — CRUCIALLY abfluss_datum (year_of_buchung driver) — stays
    -- byte-equal, so a mark-as-paid that would MOVE the Buchungsjahr (NULL
    -- abfluss → payment date) is rejected; only the payment-reconciliation
    -- columns of an already-dated Auslage move.
    IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'expenses' THEN
      IF NEW.id                          IS NOT DISTINCT FROM OLD.id
         AND NEW.business_id              IS NOT DISTINCT FROM OLD.business_id
         AND NEW.source                   IS NOT DISTINCT FROM OLD.source
         AND NEW.source_ref               IS NOT DISTINCT FROM OLD.source_ref
         AND NEW.betrag_cents             IS NOT DISTINCT FROM OLD.betrag_cents
         AND NEW.currency                 IS NOT DISTINCT FROM OLD.currency
         AND NEW.bezeichnung              IS NOT DISTINCT FROM OLD.bezeichnung
         AND NEW.rechnungsdatum           IS NOT DISTINCT FROM OLD.rechnungsdatum
         AND NEW.abfluss_datum            IS NOT DISTINCT FROM OLD.abfluss_datum
         AND NEW.gebucht_am               IS NOT DISTINCT FROM OLD.gebucht_am
         AND NEW.kategorie_id             IS NOT DISTINCT FROM OLD.kategorie_id
         AND NEW.kategorie_name_snapshot  IS NOT DISTINCT FROM OLD.kategorie_name_snapshot
         AND NEW.sphere_snapshot          IS NOT DISTINCT FROM OLD.sphere_snapshot
         AND NEW.sphere_override          IS NOT DISTINCT FROM OLD.sphere_override
         AND NEW.sphere_override_reason   IS NOT DISTINCT FROM OLD.sphere_override_reason
         AND NEW.project_id               IS NOT DISTINCT FROM OLD.project_id
         AND NEW.customer_id              IS NOT DISTINCT FROM OLD.customer_id
         AND NEW.bezahlt_von_kind         IS NOT DISTINCT FROM OLD.bezahlt_von_kind
         AND NEW.bezahlt_von_member_id    IS NOT DISTINCT FROM OLD.bezahlt_von_member_id
         AND NEW.bezahlt_von_display      IS NOT DISTINCT FROM OLD.bezahlt_von_display
         AND NEW.extern_name              IS NOT DISTINCT FROM OLD.extern_name
         AND NEW.extern_iban              IS NOT DISTINCT FROM OLD.extern_iban
         AND NEW.extern_email             IS NOT DISTINCT FROM OLD.extern_email
         AND NEW.beleg_file_id            IS NOT DISTINCT FROM OLD.beleg_file_id
         AND NEW.beleg_drive_file_id      IS NOT DISTINCT FROM OLD.beleg_drive_file_id
         AND NEW.beleg_original_name      IS NOT DISTINCT FROM OLD.beleg_original_name
         AND NEW.beleg_verzicht_grund     IS NOT DISTINCT FROM OLD.beleg_verzicht_grund
         AND NEW.kommentar                IS NOT DISTINCT FROM OLD.kommentar
         AND NEW.approved_at              IS NOT DISTINCT FROM OLD.approved_at
         AND NEW.approved_by_user_id      IS NOT DISTINCT FROM OLD.approved_by_user_id
         AND NEW.rejected_at              IS NOT DISTINCT FROM OLD.rejected_at
         AND NEW.rejected_by_user_id      IS NOT DISTINCT FROM OLD.rejected_by_user_id
         AND NEW.rejected_reason          IS NOT DISTINCT FROM OLD.rejected_reason
         AND NEW.festgeschrieben_at       IS NOT DISTINCT FROM OLD.festgeschrieben_at
         AND NEW.festgeschrieben_by_user_id IS NOT DISTINCT FROM OLD.festgeschrieben_by_user_id
         AND NEW.supersedes_id            IS NOT DISTINCT FROM OLD.supersedes_id
         AND NEW.created_at               IS NOT DISTINCT FROM OLD.created_at
         AND NEW.created_by_user_id       IS NOT DISTINCT FROM OLD.created_by_user_id
      THEN
        -- Only erstattet_am, zahlungsart_id, status, and/or updated_at differ.
        RETURN NEW;
      END IF;
    END IF;

    -- ── F31 carve-out (GDPR Art. 17) — donations donor-PII erasure ─────────
    -- Only {spender_name, spender_adresse, spender_email (→NULL), updated_at}
    -- may differ (0037). Coexists with the certificate carve-out below.
    IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'donations' THEN
      IF NEW.spender_name    IS NULL
         AND NEW.spender_adresse IS NULL
         AND NEW.spender_email   IS NULL
         AND NEW.id                                  IS NOT DISTINCT FROM OLD.id
         AND NEW.business_id                         IS NOT DISTINCT FROM OLD.business_id
         AND NEW.source                              IS NOT DISTINCT FROM OLD.source
         AND NEW.source_ref                          IS NOT DISTINCT FROM OLD.source_ref
         AND NEW.gebucht_am                          IS NOT DISTINCT FROM OLD.gebucht_am
         AND NEW.zugewendet_am                       IS NOT DISTINCT FROM OLD.zugewendet_am
         AND NEW.betrag_cents                        IS NOT DISTINCT FROM OLD.betrag_cents
         AND NEW.currency                            IS NOT DISTINCT FROM OLD.currency
         AND NEW.member_id                           IS NOT DISTINCT FROM OLD.member_id
         AND NEW.spende_kind                         IS NOT DISTINCT FROM OLD.spende_kind
         AND NEW.zweckbindung_kind                   IS NOT DISTINCT FROM OLD.zweckbindung_kind
         AND NEW.zweckbindung_text                   IS NOT DISTINCT FROM OLD.zweckbindung_text
         AND NEW.kategorie_id                        IS NOT DISTINCT FROM OLD.kategorie_id
         AND NEW.kategorie_name_snapshot             IS NOT DISTINCT FROM OLD.kategorie_name_snapshot
         AND NEW.sphere_snapshot                     IS NOT DISTINCT FROM OLD.sphere_snapshot
         AND NEW.project_id                          IS NOT DISTINCT FROM OLD.project_id
         AND NEW.bescheinigung_nr                    IS NOT DISTINCT FROM OLD.bescheinigung_nr
         AND NEW.bescheinigung_ausgestellt_am        IS NOT DISTINCT FROM OLD.bescheinigung_ausgestellt_am
         AND NEW.bescheinigung_ausgestellt_von_user_id IS NOT DISTINCT FROM OLD.bescheinigung_ausgestellt_von_user_id
         AND NEW.bescheinigung_pdf_drive_file_id     IS NOT DISTINCT FROM OLD.bescheinigung_pdf_drive_file_id
         AND NEW.bescheid_typ                        IS NOT DISTINCT FROM OLD.bescheid_typ
         AND NEW.beleg_file_id                       IS NOT DISTINCT FROM OLD.beleg_file_id
         AND NEW.bescheinigung_file_id               IS NOT DISTINCT FROM OLD.bescheinigung_file_id
         AND NEW.aufwandsspende_aus_expense_id       IS NOT DISTINCT FROM OLD.aufwandsspende_aus_expense_id
         AND NEW.aufwandsspende_verzicht_datum       IS NOT DISTINCT FROM OLD.aufwandsspende_verzicht_datum
         AND NEW.aufwandsspende_verzicht_text_snapshot IS NOT DISTINCT FROM OLD.aufwandsspende_verzicht_text_snapshot
         AND NEW.wertermittlung_methode              IS NOT DISTINCT FROM OLD.wertermittlung_methode
         AND NEW.zustand_beschreibung                IS NOT DISTINCT FROM OLD.zustand_beschreibung
         AND NEW.herkunftsbeleg_file_id              IS NOT DISTINCT FROM OLD.herkunftsbeleg_file_id
         AND NEW.betriebsvermoegen                   IS NOT DISTINCT FROM OLD.betriebsvermoegen
         AND NEW.festgeschrieben_at                  IS NOT DISTINCT FROM OLD.festgeschrieben_at
         AND NEW.festgeschrieben_by_user_id          IS NOT DISTINCT FROM OLD.festgeschrieben_by_user_id
         AND NEW.supersedes_id                       IS NOT DISTINCT FROM OLD.supersedes_id
         AND NEW.created_at                          IS NOT DISTINCT FROM OLD.created_at
         AND NEW.created_by_user_id                  IS NOT DISTINCT FROM OLD.created_by_user_id
      THEN
        RETURN NEW;
      END IF;
    END IF;

    -- ── ADR-0006 Nachtrag (b) — donations certificate issuance columns ─────
    -- Only {bescheinigung_nr, bescheinigung_ausgestellt_am,
    -- bescheinigung_ausgestellt_von_user_id, bescheid_typ, updated_at} may
    -- differ — the exact set allocateBescheinigung writes. Donor PII + all
    -- financial/Sachspende/Aufwandsspende/Zweckbindung fields stay byte-equal.
    -- Independent of the F31 block above (either path may RETURN NEW).
    IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'donations' THEN
      IF NEW.id                                     IS NOT DISTINCT FROM OLD.id
         AND NEW.business_id                         IS NOT DISTINCT FROM OLD.business_id
         AND NEW.source                              IS NOT DISTINCT FROM OLD.source
         AND NEW.source_ref                          IS NOT DISTINCT FROM OLD.source_ref
         AND NEW.gebucht_am                          IS NOT DISTINCT FROM OLD.gebucht_am
         AND NEW.zugewendet_am                       IS NOT DISTINCT FROM OLD.zugewendet_am
         AND NEW.betrag_cents                        IS NOT DISTINCT FROM OLD.betrag_cents
         AND NEW.currency                            IS NOT DISTINCT FROM OLD.currency
         AND NEW.member_id                           IS NOT DISTINCT FROM OLD.member_id
         AND NEW.spender_name                        IS NOT DISTINCT FROM OLD.spender_name
         AND NEW.spender_adresse                     IS NOT DISTINCT FROM OLD.spender_adresse
         AND NEW.spender_email                       IS NOT DISTINCT FROM OLD.spender_email
         AND NEW.spende_kind                         IS NOT DISTINCT FROM OLD.spende_kind
         AND NEW.zweckbindung_kind                   IS NOT DISTINCT FROM OLD.zweckbindung_kind
         AND NEW.zweckbindung_text                   IS NOT DISTINCT FROM OLD.zweckbindung_text
         AND NEW.kategorie_id                        IS NOT DISTINCT FROM OLD.kategorie_id
         AND NEW.kategorie_name_snapshot             IS NOT DISTINCT FROM OLD.kategorie_name_snapshot
         AND NEW.sphere_snapshot                     IS NOT DISTINCT FROM OLD.sphere_snapshot
         AND NEW.project_id                          IS NOT DISTINCT FROM OLD.project_id
         AND NEW.bescheinigung_pdf_drive_file_id     IS NOT DISTINCT FROM OLD.bescheinigung_pdf_drive_file_id
         AND NEW.beleg_file_id                       IS NOT DISTINCT FROM OLD.beleg_file_id
         AND NEW.bescheinigung_file_id               IS NOT DISTINCT FROM OLD.bescheinigung_file_id
         AND NEW.aufwandsspende_aus_expense_id       IS NOT DISTINCT FROM OLD.aufwandsspende_aus_expense_id
         AND NEW.aufwandsspende_verzicht_datum       IS NOT DISTINCT FROM OLD.aufwandsspende_verzicht_datum
         AND NEW.aufwandsspende_verzicht_text_snapshot IS NOT DISTINCT FROM OLD.aufwandsspende_verzicht_text_snapshot
         AND NEW.wertermittlung_methode              IS NOT DISTINCT FROM OLD.wertermittlung_methode
         AND NEW.zustand_beschreibung                IS NOT DISTINCT FROM OLD.zustand_beschreibung
         AND NEW.herkunftsbeleg_file_id              IS NOT DISTINCT FROM OLD.herkunftsbeleg_file_id
         AND NEW.betriebsvermoegen                   IS NOT DISTINCT FROM OLD.betriebsvermoegen
         AND NEW.festgeschrieben_at                  IS NOT DISTINCT FROM OLD.festgeschrieben_at
         AND NEW.festgeschrieben_by_user_id          IS NOT DISTINCT FROM OLD.festgeschrieben_by_user_id
         AND NEW.supersedes_id                       IS NOT DISTINCT FROM OLD.supersedes_id
         AND NEW.created_at                          IS NOT DISTINCT FROM OLD.created_at
         AND NEW.created_by_user_id                  IS NOT DISTINCT FROM OLD.created_by_user_id
      THEN
        -- Only bescheinigung_nr, bescheinigung_ausgestellt_am,
        -- bescheinigung_ausgestellt_von_user_id, bescheid_typ, updated_at differ.
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
