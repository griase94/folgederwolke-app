-- ADR-0001: year-derivation = Buchhaltungsjahr.
--
-- IMMUTABLE so it can back a STORED generated column (year_of_buchung on
-- expenses, income, donations, invoices). Returns the calendar year of the
-- given timestamp interpreted in Europe/Berlin. Imported legacy rows pass
-- their original `gebucht_am` (sheet-side timestamp) so year_of_buchung
-- matches the legacy A-/E-/S-/FDW-ID year segment (ADR-0010).

CREATE OR REPLACE FUNCTION year_for_booking(ts timestamptz)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT extract(year FROM ts AT TIME ZONE 'Europe/Berlin')::int
$$;
