-- Add width/height columns to design_files so each placed image can carry its own size.
-- Defaults match IMG_DEFAULT_W / IMG_DEFAULT_H in WorkspacePage.jsx.
ALTER TABLE design_files ADD COLUMN IF NOT EXISTS width INT DEFAULT 460;
ALTER TABLE design_files ADD COLUMN IF NOT EXISTS height INT DEFAULT 340;
