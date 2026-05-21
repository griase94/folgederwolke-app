-- Phase 9 prerequisite: extend entity_kind enum BEFORE 0016 creates the files
-- table + trigger that uses entityKind='file' from app code.
--
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block (PG 17).
-- Drizzle wraps multi-statement migrations in BEGIN/COMMIT; single-statement
-- migrations are committed individually, bypassing the wrap.
ALTER TYPE entity_kind ADD VALUE IF NOT EXISTS 'file';
