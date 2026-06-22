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
-- public.assert_not_festgeschrieben_fn) blocks ALL UPDATEs on a donation whose
-- Buchungsjahr is festgeschrieben. So an erasure for a donor with any donation
-- in a closed year threw 23514, aborted the WHOLE pseudonymise transaction
-- (member PII, user/session, mails all rolled back too) and silently erased
-- nothing.
--
-- Carve-out: when the table is `donations` and the UPDATE sets the three PII
-- columns to NULL while leaving every OTHER non-generated column unchanged, the
-- trigger lets the UPDATE through even on festgeschriebene rows. This is the
-- exact, minimal permission GDPR erasure needs; ALL other fields — financial,
-- Bescheinigung issuer/PDF handle, Aufwandsspende provenance + Verzichtsdatum,
-- Sachspende Wertermittlung + Zustand + Betriebsvermögen flag, festschreibung,
-- supersedes-chain — stay byte-equal (mirrors the exhaustive invoices payment
-- carve-out in 0025).
--
-- IMPORTANT (review F1): this CREATE OR REPLACE is built on the LIVE 0034 body
-- (booking_year_from_cashflow), preserving the per-table cash-flow-date year
-- derivation (expenses.abfluss_datum / income.geld_eingang_datum /
-- donations.zugewendet_am via v_old_year/v_new_year). The STORED generated
-- year_of_buchung column is NULL inside a BEFORE trigger, so the guarded
-- Buchungsjahr MUST be recomputed inline from the cash date — NOT from
-- year_for_booking(gebucht_am). Reverting to the gebucht_am form would re-open
-- the ADR-0004 / GoBD §146 tamper-evidence hole 0034 closed. The income/
-- expenses branches keep the original (fully-locked) behaviour.

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
    -- ── Phase 12 carve-out (§ 11 EStG Zufluss) — invoices payment columns ──
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

    -- ── F31 carve-out (GDPR Art. 17) — donations donor-PII erasure ─────────
    -- Permit an UPDATE that NULLs the three donor-PII columns while leaving
    -- every other non-generated column byte-equal to OLD. The PII columns MUST
    -- be NULL in NEW (this is an erasure, not an edit); only redaction — not
    -- arbitrary mutation — is allowed on a festgeschriebene Spende. The
    -- allowlist is EXHAUSTIVE over the donations table's non-generated columns
    -- (generated betrag_eur / year_of_buchung can't be set), so only
    -- {spender_name, spender_adresse, spender_email (→NULL), updated_at} may
    -- differ. (Review F2: includes the previously-omitted Bescheinigung issuer/
    -- PDF, Aufwandsspende + Sachspende Wertermittlung columns.)
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
