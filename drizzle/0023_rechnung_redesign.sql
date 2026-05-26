-- Phase 10 — Rechnung v2 visual redesign.
--
-- Adds:
-- 1. customers.country (ISO-3166-1 alpha-2). Default 'DE'; renderer hides
--    the Land line below PLZ Ort when country = 'DE'.
-- 2. invoices.leistungszeitraum (free-text). Rendered as a row in the meta
--    block when set; the row collapses cleanly when null/empty.
-- 3. settings row 'verein.kassenwaert_name' (jsonb string). Default
--    "Julia Schwarz" — admins can update it from /app/einstellungen without
--    a redeploy.

ALTER TABLE customers
  ADD COLUMN country text NOT NULL DEFAULT 'DE';

COMMENT ON COLUMN customers.country IS
  'ISO 3166-1 alpha-2 country code. ''DE'' is default and is NOT rendered on the Rechnungs PDF; any other value is rendered as the Land line below PLZ Ort.';

-- Leistungszeitraum is MANDATORY per § 14 Abs. 4 Nr. 6 UStG — every invoice
-- must indicate the time of delivery/service, even when identical to the
-- invoice date (§ 31 Abs. 4 UStDV allows "Leistungsdatum entspricht
-- Rechnungsdatum" as the literal value). NULL would produce a legally
-- non-compliant invoice.
--
-- Backfill existing rows with the conservative default before adding the
-- NOT NULL + length constraints.
ALTER TABLE invoices
  ADD COLUMN leistungszeitraum text;

UPDATE invoices
  SET leistungszeitraum = 'Leistungsdatum entspricht Rechnungsdatum'
  WHERE leistungszeitraum IS NULL;

ALTER TABLE invoices
  ALTER COLUMN leistungszeitraum SET NOT NULL;

ALTER TABLE invoices
  ADD CONSTRAINT invoices_leistungszeitraum_min_len_ck
    CHECK (char_length(leistungszeitraum) >= 3);

COMMENT ON COLUMN invoices.leistungszeitraum IS
  'Leistungszeitraum/Leistungsdatum per § 14 Abs. 4 Nr. 6 UStG. Required on every invoice. Common values: "Februar 2026", "21.02.2026", or "Leistungsdatum entspricht Rechnungsdatum".';

-- Kleinunternehmer (§ 19 UStG) MUST NOT show Umsatzsteuer — would trigger
-- § 14c Abs. 2 UStG liability (Steuerschuld kraft Rechnungsausweis). Lock
-- ust_cents to zero so a future migration / refactor can't accidentally
-- re-enable it.
ALTER TABLE invoices
  ADD CONSTRAINT invoices_kleinunternehmer_zero_ust_ck
    CHECK (ust_cents = 0);

-- Currency must be EUR (Kleinunternehmer-Rechnungen in Fremdwährung
-- erfordern Umrechnung nach § 16 Abs. 6 UStG — out of scope for this Verein).
ALTER TABLE invoices
  ADD CONSTRAINT invoices_eur_only_ck
    CHECK (currency = 'EUR');

INSERT INTO settings (key, value)
VALUES ('verein.kassenwaert_name', '"Julia Schwarz"'::jsonb)
ON CONFLICT (key) DO NOTHING;
