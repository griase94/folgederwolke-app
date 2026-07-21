-- Add the invoice-eligibility flag. IF NOT EXISTS keeps the whole pending
-- batch idempotent (a re-applied batch or hand-patched DB can't wedge the txn).
ALTER TABLE "kategorien" ADD COLUMN IF NOT EXISTS "rechnungsfaehig" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Prod-reachability backfill: scripts/seed.ts never runs against prod, so
-- ADD COLUMN alone would leave every Kategorie rechnungsfaehig=false and the
-- invoice form's Kategorie dropdown EMPTY after deploy. Mirror the seed here:
-- (a) insert the two new invoiceable income Kategorien (idempotent), then
-- (b) flip the eight rechnungsfähige income names to true. Both parts are
-- idempotent, so a re-applied batch is a no-op. Kept in lock-step with the
-- rechnungsfaehig flags + new rows in scripts/seed.ts (EINNAHMEN_KATEGORIEN).
INSERT INTO "kategorien" ("kind", "name", "sphere", "rechnungsfaehig", "sort_order")
VALUES
  ('income', 'Dienstleistung (allgemein)', 'wirtschaftlich', true, 2),
  ('income', 'Vermietung Technik', 'wirtschaftlich', true, 15)
ON CONFLICT ("kind", "name") DO NOTHING;
--> statement-breakpoint
UPDATE "kategorien" SET "rechnungsfaehig" = true
WHERE "kind" = 'income' AND "name" IN (
  'Dienstleistung (allgemein)',
  'Honorar künstlerische Leistung',
  'Kuratierung & Künstlerische Leitung',
  'Sonstige Einnahme (WGB)',
  'Sonstige Einnahme (Zweckbetrieb)',
  'Sponsoring (mit Gegenleistung)',
  'Vermietung Technik',
  'Workshop / Kursgebühr'
);
