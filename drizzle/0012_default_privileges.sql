-- ============================================================================
-- 0012_default_privileges.sql — Apply default grants to future tables.
--
-- 0002_roles.sql grants on tables that exist at migration time. Without
-- ALTER DEFAULT PRIVILEGES, new tables added in later migrations are NOT
-- automatically granted to app_runtime / app_export — every new table
-- needed a manual GRANT (which we'd forget).
--
-- This migration fixes that for all future migrations run against the same
-- database. Safe to apply on an existing database — it only affects FUTURE
-- CREATE TABLE statements, not existing ones.
--
-- Idempotent: ALTER DEFAULT PRIVILEGES with the same grants is a no-op.
-- ============================================================================

-- app_runtime: CRUD on all future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;

-- app_runtime: usage on future sequences (for serial / identity columns)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_runtime;

-- app_export: read-only on all future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO app_export;
