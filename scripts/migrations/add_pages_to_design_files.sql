-- ─────────────────────────────────────────────────────────────
-- Add pages (multi-page artboard) to design_files
--
-- 1) Create `pages` table: per-sprint A4 frames laid out in the
--    artboard. Sprint can have many pages; pages have title + size +
--    canvas position (so future horizontal layout works).
-- 2) Add `page_id` + `page_number` to `design_files` so each uploaded
--    image belongs to a specific page within a sprint.
-- 3) Enable RLS and add permissive policies (matches existing app
--    pattern — tighten later when auth scoping is finalized).
-- ─────────────────────────────────────────────────────────────

-- 1) pages table
CREATE TABLE IF NOT EXISTS pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  sprint_number INT NOT NULL,
  page_number INT NOT NULL DEFAULT 1,
  title TEXT DEFAULT 'Page 1',
  width INT DEFAULT 794,   -- A4 width  @ 96dpi
  height INT DEFAULT 1123, -- A4 height @ 96dpi
  x_position INT DEFAULT 0,
  y_position INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pages_project_sprint_idx
  ON pages (project_id, sprint_number, page_number);

-- 2) design_files: add page references
ALTER TABLE design_files
  ADD COLUMN IF NOT EXISTS page_id UUID REFERENCES pages(id) ON DELETE SET NULL;

ALTER TABLE design_files
  ADD COLUMN IF NOT EXISTS page_number INT;

-- (Optional) position of the image inside its page — used by drag/snap.
ALTER TABLE design_files
  ADD COLUMN IF NOT EXISTS x_in_page INT DEFAULT 0;

ALTER TABLE design_files
  ADD COLUMN IF NOT EXISTS y_in_page INT DEFAULT 0;

-- 3) RLS policies
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pages_select ON pages;
CREATE POLICY pages_select ON pages FOR SELECT USING (true);

DROP POLICY IF EXISTS pages_insert ON pages;
CREATE POLICY pages_insert ON pages FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS pages_update ON pages;
CREATE POLICY pages_update ON pages FOR UPDATE USING (true);

DROP POLICY IF EXISTS pages_delete ON pages;
CREATE POLICY pages_delete ON pages FOR DELETE USING (true);
