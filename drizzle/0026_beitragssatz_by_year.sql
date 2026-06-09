-- Migration 0026: per-year Beitragssatz table.
--
-- Stores the Verein's annual membership fee (Mitgliedsbeitrag) with provenance:
-- who decided it, when, and under which resolution (Beschluss).
-- Seeds historical years 2020 → current_year+1 with the legacy default €69.69.
--
-- ADR-0003: money stays bigint cents.
-- ADR-0006: beitragssatz rows are immutable once the year is festgeschrieben.

-- Idempotent: this whole batch (0026-0029) applies in ONE transaction, so any
-- statement that throws against pre-existing state rolls back the entire batch
-- (incl. the 0029 grant). IF NOT EXISTS keeps a partial/hand-patched DB safe.
CREATE TABLE IF NOT EXISTS beitragssatz_by_year (
  year                  integer       PRIMARY KEY,
  cents                 bigint        NOT NULL CHECK (cents >= 0),
  faelligkeit_at        date,           -- nullable; null → caller defaults to ${year}-03-31
  decided_at            timestamptz   NOT NULL DEFAULT now(),
  decided_by_user_id    uuid          REFERENCES users(id) ON DELETE SET NULL,
  decision_note         text,           -- e.g. "MV 14.03.2026, TOP 7"
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now()
);

-- Default privileges from migration 0012 cover future tables for app_runtime
-- and app_export automatically, but we add explicit grants for clarity and
-- to cover environments where 0012 has not run (e.g. fresh test DBs with
-- only partial migration history).
GRANT SELECT, INSERT, UPDATE ON beitragssatz_by_year TO app_runtime;
GRANT SELECT ON beitragssatz_by_year TO app_export;

-- Seed historical years 2020 → current_year+1 with €69.69 default.
-- ON CONFLICT DO NOTHING makes the migration idempotent if re-applied.
INSERT INTO beitragssatz_by_year (year, cents, decision_note)
  SELECT y, 6969, 'Initial migration default (€69,69)'
  FROM generate_series(2020, EXTRACT(year FROM CURRENT_DATE)::int + 1) AS y
ON CONFLICT DO NOTHING;
