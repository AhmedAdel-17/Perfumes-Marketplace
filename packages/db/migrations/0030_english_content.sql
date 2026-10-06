-- =============================================================================
-- 0030 — English content (P5.6.2 step 3, decision D-3 of 30 Sep 2026)
--
-- The interface speaks English since step 2; the CONTENT did not, because
-- nothing had anywhere to keep it. This adds the English half of what people
-- write, and nothing else:
--
--   * products.name_en already existed (0000) and was never written. It is the
--     house's own English name for a perfume, entered in the listing editor.
--   * a house's bio and story, in English.
--   * a CMS page's title and blocks, in English — on the draft and on every
--     published revision, so an English page is versioned exactly like the
--     Arabic one and a published translation is as immutable as its original.
--   * an announcement's message, in English.
--   * a GLOSSARY of scent notes rather than an English copy of every product's
--     notes. A note is vocabulary, not prose: "برغموت" is "Bergamot" on every
--     perfume that has it. A glossary kept by the platform's content manager
--     (CLAUDE.md §3) keeps one word for one note across the catalogue — the
--     controlled vocabulary §4 asks for — and asks no small house to write
--     English it may not have.
--
-- Every English column is OPTIONAL. The storefront shows the Arabic, marked as
-- Arabic, wherever the English is missing. Nothing here enters the publish gate:
-- a listing that is complete in Arabic is a complete listing (the launch
-- market is Egypt), and making English mandatory would hold back every house
-- that has not translated yet.
-- =============================================================================

ALTER TABLE sellers ADD COLUMN bio_en text;--> statement-breakpoint
ALTER TABLE sellers ADD COLUMN story_en text;--> statement-breakpoint

ALTER TABLE announcements ADD COLUMN message_en text;--> statement-breakpoint
-- The same bound as the Arabic line, for the same reason: past 160 characters a
-- notice stops fitting on a phone and starts pushing the shop below the fold.
ALTER TABLE announcements ADD CONSTRAINT announcements_message_en_length
  CHECK (message_en IS NULL OR char_length(btrim(message_en)) BETWEEN 1 AND 160);--> statement-breakpoint

ALTER TABLE content_pages ADD COLUMN title_en text;--> statement-breakpoint
ALTER TABLE content_pages ADD COLUMN draft_blocks_en jsonb NOT NULL DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE content_pages ADD CONSTRAINT content_pages_title_en_present
  CHECK (title_en IS NULL OR char_length(btrim(title_en)) > 0);--> statement-breakpoint
ALTER TABLE content_pages ADD CONSTRAINT content_pages_draft_en_is_array
  CHECK (jsonb_typeof(draft_blocks_en) = 'array');--> statement-breakpoint

-- A revision's English half may be empty — a page published before anyone
-- translated it — but it is always an array, and it is snapshotted with the
-- Arabic so a later translation never rewrites what was published.
ALTER TABLE content_revisions ADD COLUMN title_en text;--> statement-breakpoint
ALTER TABLE content_revisions ADD COLUMN blocks_en jsonb NOT NULL DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE content_revisions ADD CONSTRAINT content_revisions_blocks_en_is_array
  CHECK (jsonb_typeof(blocks_en) = 'array');--> statement-breakpoint

CREATE TABLE note_glossary (
  -- The note exactly as houses write it in Arabic. The key is the text itself,
  -- not an id, because products store their notes as text: the join is on what
  -- a house typed.
  ar text PRIMARY KEY,
  en text NOT NULL,
  updated_by uuid REFERENCES platform_staff(id),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Short phrases, the same bound the listing validator puts on a note.
  CONSTRAINT note_glossary_ar_shape CHECK (char_length(btrim(ar)) BETWEEN 1 AND 40),
  CONSTRAINT note_glossary_en_shape CHECK (char_length(btrim(en)) BETWEEN 1 AND 40)
);--> statement-breakpoint

ALTER TABLE note_glossary ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE note_glossary FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- Everyone reads it: the English storefront is public.
CREATE POLICY public_read_note_glossary ON note_glossary
  FOR SELECT USING (true);--> statement-breakpoint

-- Only the platform writes it. A house naming its own notes in English would be
-- the per-product translation this table exists to replace.
CREATE POLICY platform_manage_note_glossary ON note_glossary
  FOR ALL USING (app.is_platform()) WITH CHECK (app.is_platform());--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON note_glossary TO app_user;
