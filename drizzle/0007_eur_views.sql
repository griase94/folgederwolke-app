-- Migration 0007: v_eur_year view + supporting indexes for the EÜR export.
--
-- v_eur_year: unified income + expense rows for a given year, enriched with
-- kategorie eur_zeile and anlage_gem_zeile mappings (from kategorien table).
-- Used by the Jahresabschluss export and the /app/jahresabschluss/[year] page.

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
LEFT JOIN kategorien k ON k.id = e.kategorie_id;

-- Grant SELECT to app_export role (tax export tooling)
GRANT SELECT ON v_eur_year TO app_export;

-- Also grant SELECT on underlying tables to app_export (if not already granted)
GRANT SELECT ON kategorien TO app_export;
