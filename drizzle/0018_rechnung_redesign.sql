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

ALTER TABLE invoices
  ADD COLUMN leistungszeitraum text;

COMMENT ON COLUMN invoices.leistungszeitraum IS
  'Free-text Leistungszeitraum for the Rechnung header (e.g. "Februar 2026"). Optional; rendered as the third row of the meta block when set.';

INSERT INTO settings (key, value)
VALUES ('verein.kassenwaert_name', '"Julia Schwarz"'::jsonb)
ON CONFLICT (key) DO NOTHING;
