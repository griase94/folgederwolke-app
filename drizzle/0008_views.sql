-- Migration 0008: v_wgb_freigrenze_status view
--
-- WGB = wirtschaftlicher Geschäftsbetrieb (§14 AO / §64 AO).
-- Kleinunternehmer-Regelung §19 UStG: gross revenue from wirtschaftlicher
-- Sphäre must not exceed 45.000 € per calendar year (from 2024 onwards;
-- previously 22.000 €).
--
-- This view provides the dashboard widget with YTD gross Einnahmen for the
-- current Berlin-timezone year in the 'wirtschaftlich' sphere only.
-- The thresholds are intentionally hardcoded here (not settings-table-driven)
-- because they are statutory limits, not operator-configurable values.

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
    AND supersedes_id IS NULL;  -- exclude storno rows (the original is kept, storno negates via new row with negative amount or is flagged via supersedes)

COMMENT ON VIEW v_wgb_freigrenze_status IS
    'WGB Kleinunternehmer-Freigrenze §19 UStG: YTD gross Einnahmen (wirtschaftlich sphere) vs 45.000 € limit for current Berlin year.';
