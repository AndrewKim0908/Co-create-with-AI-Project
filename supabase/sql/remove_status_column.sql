-- Remove project status column and its check constraint (run in Supabase SQL Editor)

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE public.projects
  DROP COLUMN IF EXISTS status;

-- Verify remaining columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'projects'
  AND table_schema = 'public'
ORDER BY ordinal_position;
