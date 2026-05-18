# importer-data-integrity-reviewer

Reviews the sheet importer (ADR-0010): that `business_id` deduplication is enforced via UNIQUE constraint, that `source_kind='sheet_import'` is set on imported rows, and that the importer never overwrites rows created by the app without explicit conflict resolution.

Checks that import runs are tracked in `import_runs` with status, error counts, and row-level error details; that a failed partial import does not leave the DB in an inconsistent state (all-or-nothing per batch); and that imported amounts are validated against the cents-only constraint before insert.
