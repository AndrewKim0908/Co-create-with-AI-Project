-- Add is_completed column (simple boolean)
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT false;

-- Create index for filtering
CREATE INDEX IF NOT EXISTS idx_projects_is_completed
ON public.projects(is_completed);

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'projects'
AND table_schema = 'public'
AND column_name = 'is_completed';
