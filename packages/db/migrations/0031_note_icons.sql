-- =============================================================================
-- 0031 — A drawing for every scent note (founder, 17 Oct 2026)
--
-- The storefront prints each note with a small drawing: a bergamot, a rose, a
-- ring of wood. Notes are free text, written by houses, so the drawing cannot
-- belong to the product; it belongs to the NOTE, and the note glossary (0030)
-- is where the platform already keeps one fact per note. The drawing is chosen
-- from a closed set — CLAUDE.md §4, controlled vocabularies only — and is
-- nullable: a note nobody has assigned shows a neutral mark, never a guess.
--
-- Nothing else changes: the glossary's RLS already lets everyone read and only
-- the platform write, which is exactly who should see and choose a drawing.
-- =============================================================================

CREATE TYPE note_icon AS ENUM (
  'bergamot', 'citrus', 'cardamom', 'saffron', 'jasmine', 'white_flower', 'rose', 'violet', 'bloom', 'leaf', 'sprig', 'palm', 'wood', 'oud', 'amber', 'musk', 'vanilla', 'incense', 'cool'
);--> statement-breakpoint

ALTER TABLE note_glossary ADD COLUMN icon note_icon;
