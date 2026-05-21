-- C9-JUL-lite: GoBD-Z3 export needs SELECT on the EÜR materialised view from
-- the application runtime role. The view was created without grants in
-- migration 0007; app_runtime currently gets "permission denied for view
-- v_eur_year" when /jahresabschluss/<year>/gobd-export runs.
GRANT SELECT ON v_eur_year TO app_runtime;
