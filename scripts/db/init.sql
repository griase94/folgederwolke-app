-- Runs once when folgederwolke_pgdata volume is first created.
-- Creates the dev database. App roles + grants are managed by drizzle migrations.
CREATE DATABASE folgederwolke_dev;
-- Test DB is created on demand by scripts/db/reset-test-db.sh
