# db-reviewer

Reviews all Drizzle schema files and raw SQL migrations: correct use of `pgEnum`, proper foreign-key constraints, ON DELETE behaviour, partial indexes for soft-delete patterns, and advisory-lock usage for race-safe operations.

Verifies that migration files are numbered sequentially, are idempotent where possible (`IF NOT EXISTS`, `DO $$ ... $$`), and that `drizzle/meta/_journal.json` is updated to match. Checks that app_runtime / app_migrate / app_export roles follow ADR-0004 least-privilege grants and that `audit_log` is INSERT-only for app_runtime.
