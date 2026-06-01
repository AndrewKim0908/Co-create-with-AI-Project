-- Add priorities JSONB column for new single-direction importance UI.
-- Existing rows keep NULL; the loader falls back to legacy priority_* columns.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS priorities JSONB;
