-- C1-PRJ-A: Projekte first-class — a Projekt is the IA anchor for invoicing
-- workflows. Most Projekte have a single canonical Kunde (the school, the
-- promoter, etc.). default_customer_id allows /rechnungen/new?projectId=X
-- to pre-fill the customer FK so the user doesn't have to re-pick.
--
-- Additive only — NULL allowed. ON DELETE SET NULL: if a customer is
-- soft-deleted/removed, the project simply loses the default; existing
-- invoices/expenses are unaffected (they snapshot the customer reference
-- at write time).
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS default_customer_id uuid NULL
    REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS projects_default_customer_id_idx
  ON projects(default_customer_id);
