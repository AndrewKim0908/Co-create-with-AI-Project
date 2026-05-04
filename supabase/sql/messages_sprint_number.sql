-- Per-sprint chat: filter and insert with sprint_number from the app.
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS sprint_number INTEGER DEFAULT 1;
