-- Custom migration: let the app + export roles READ the migration ledger.
--
-- The `drizzle` schema (created by the migrator before any migration runs)
-- and its `__drizzle_migrations` table are owned by the migrate/owner role.
-- By default no other role has USAGE on that schema, so `app_runtime` (the
-- app's runtime connection) cannot read it — see the probe in
-- migration-journal-integrity context. The /healthz schema canary needs to
-- count applied migrations as `app_runtime`; without this grant the query
-- raises 42501 (permission denied) and the canary degrades to "unknown".
--
-- SELECT-only: the ledger stays append-only/owner-writable. `app_export` gets
-- the same read access for consistency with the export role's SELECT-on-all
-- contract (and so pg_dump as app_export can see the schema's contents).
--
-- Idempotent: GRANT is a no-op when already present, and the schema + table
-- always exist by the time this migration runs (CREATE ... IF NOT EXISTS in
-- the migrator preamble).
GRANT USAGE ON SCHEMA drizzle TO app_runtime, app_export;
--> statement-breakpoint
GRANT SELECT ON drizzle."__drizzle_migrations" TO app_runtime, app_export;
