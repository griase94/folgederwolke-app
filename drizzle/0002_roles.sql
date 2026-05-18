-- ============================================================================
-- 0002_roles.sql — App-level Postgres roles (ADR-0004, §4.5)
--
-- Creates three least-privilege roles used at runtime:
--   app_runtime  — CRUD on user data, INSERT-only on audit_log
--   app_migrate  — migration runner; inherits owner privs via Neon
--   app_export   — read-only (tax export, backup tooling)
--
-- Idempotent: all CREATE ROLE statements are guarded with IF NOT EXISTS.
-- Safe to re-run on an already-migrated database.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_migrate') THEN
    CREATE ROLE app_migrate NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_export') THEN
    CREATE ROLE app_export NOLOGIN;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- app_runtime: CRUD on all user-data tables, INSERT-only on audit_log
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;

-- audit_log is append-only for app_runtime (ADR-0004: tamper-evidence)
REVOKE UPDATE, DELETE ON audit_log FROM app_runtime;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_runtime;

-- ---------------------------------------------------------------------------
-- app_export: read-only access for tax exports and backup tooling
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO app_export;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_export;

-- ---------------------------------------------------------------------------
-- app_migrate: migration runner — granted full ownership via Neon project
-- owner role; no explicit grants needed here beyond schema visibility.
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO app_migrate;
