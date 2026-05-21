-- C2-TAX: tax-correctness needs the Geldfluss-Datum (actual cash-out date)
-- distinct from the Rechnungsdatum (invoice date) for Ausgaben. EÜR §11 EStG
-- requires the cash-flow timestamp.
-- Additive only: NULL allowed for existing rows. CHECK constraint deferred
-- to Night 3 after backfill verification (see spec Migration Allocation).
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS geldfluss_datum date NULL;
--> statement-breakpoint
COMMENT ON COLUMN expenses.geldfluss_datum IS 'Cash-out date for EÜR §11 EStG. Required at Zod+UI for kind=ausgabe going forward. DB CHECK constraint Night 3 after backfill verification.';
