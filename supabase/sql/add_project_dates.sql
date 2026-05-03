-- Add start_date and due_date columns
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS start_date DATE,
ADD COLUMN IF NOT EXISTS due_date DATE;

-- Create index for date queries
CREATE INDEX IF NOT EXISTS idx_projects_due_date
ON public.projects(due_date);

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'projects'
AND table_schema = 'public'
AND column_name IN ('start_date', 'due_date')
ORDER BY ordinal_position;
