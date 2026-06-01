-- ─────────────────────────────────────────────────────────────
-- Add text-box dimensions and alignment to text_elements.
--
-- 1) `width` / `height` — resizable text box size (px in A4 coords).
--    The actual font size stays in `font_size`; resizing the box only
--    changes the wrap width, not the glyph size.
-- 2) `text_align` — horizontal alignment inside the box.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE text_elements
  ADD COLUMN IF NOT EXISTS width  INT NOT NULL DEFAULT 200;

ALTER TABLE text_elements
  ADD COLUMN IF NOT EXISTS height INT NOT NULL DEFAULT 40;

ALTER TABLE text_elements
  ADD COLUMN IF NOT EXISTS text_align TEXT NOT NULL DEFAULT 'left'
    CHECK (text_align IN ('left', 'center', 'right'));
