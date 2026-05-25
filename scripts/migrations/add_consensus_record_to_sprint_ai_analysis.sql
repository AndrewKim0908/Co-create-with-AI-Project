-- Adds per-sprint consensus record storage for ConflictPanel's
-- Consensus Result view (completed sprints) + edit mode.
--
-- The JSONB column holds the resolved decision data:
--   {
--     "conflict":     { "title": "...", "summary": "...", "content": "..." },
--     "resolution":   { "title": "...", "description": "..." },
--     "note":         "...",
--     "participants": ["name1", "name2"],
--     "isAiPath":     false,
--     "savedAt":      "2026-05-13T12:00:00Z"
--   }
--
-- Reuses the existing UNIQUE(project_id, sprint_number) constraint on
-- sprint_ai_analysis and existing RLS policies.

ALTER TABLE sprint_ai_analysis
  ADD COLUMN IF NOT EXISTS consensus_record JSONB;
