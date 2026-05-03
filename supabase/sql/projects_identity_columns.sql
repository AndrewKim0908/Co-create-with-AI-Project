-- Project identity + conflict priority (run in Supabase SQL editor or migration pipeline)

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS description_short TEXT,
  ADD COLUMN IF NOT EXISTS description_detail TEXT,
  ADD COLUMN IF NOT EXISTS north_star TEXT,
  ADD COLUMN IF NOT EXISTS priority_aesthetics_functionality INTEGER DEFAULT 50,
  ADD COLUMN IF NOT EXISTS priority_cost_quality INTEGER DEFAULT 50,
  ADD COLUMN IF NOT EXISTS priority_speed_stability INTEGER DEFAULT 50;

-- One-line description: legacy `description` → `description_short`
UPDATE public.projects
SET description_short = description
WHERE description_short IS NULL AND description IS NOT NULL;
