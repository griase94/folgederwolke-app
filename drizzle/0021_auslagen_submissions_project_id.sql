-- drizzle/0021_auslagen_submissions_project_id.sql
-- Add optional project_id FK so an Auslage submission can be linked to a project.
-- Additive, NULL allowed — backfill is manual via UI / Night 3+ batch.
ALTER TABLE auslagen_submissions
  ADD COLUMN project_id uuid NULL
  REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS auslagen_submissions_project_id_idx
  ON auslagen_submissions(project_id) WHERE project_id IS NOT NULL;
