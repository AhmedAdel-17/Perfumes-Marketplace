-- =============================================================================
-- 0009 — Editorial content
--
-- The CMS, built on this stack rather than on Payload. TECH_STACK §11 records
-- why, including the condition under which that should be reversed.
--
-- TWO TABLES, AND THE SPLIT BETWEEN THEM IS THE WHOLE DESIGN.
--
--   content_pages       identity, slug, state, and THE DRAFT being edited
--   content_revisions   immutable snapshots — what visitors are actually served
--
-- What a visitor sees never changes because somebody is typing. Editing writes
-- to `draft_blocks`; the site reads the revision named by
-- `published_revision_id`, which nothing ever updates in place. Publishing is
-- the single act that moves one to the other, and it is the only moment the
-- content on the site can change.
--
-- Without that separation, an autosave is one keystroke away from putting a
-- half-finished sentence about a house on the shopfront — and rolling back
-- means finding the previous text, which nobody kept.
--
-- WHY JSONB AND NOT A BLOCKS TABLE. A block has meaning only in sequence,
-- inside one document, and is always read and written as a whole document.
-- Normalising it buys ordering bugs and a join for every read, and buys nothing
-- back: nothing queries across blocks. The shape is enforced by the domain's
-- discriminated union and by Zod at the API boundary, which is where a shape
-- belongs — a CHECK constraint cannot express "a heading has a level of 2 or 3
-- unless it is an image, which must have alternative text".
--
-- WHY THE EDITOR/PUBLISHER SPLIT IS NOT IN HERE. `platform_staff.role` is
-- deliberately coarse (0007), and inventing a permission matrix before anyone
-- has done the job would be guessing. So RLS answers the question it can answer
-- honestly — platform staff author, the public reads what is published — and
-- the editor/publisher distinction lives in the domain state machine, where it
-- is exhaustively tested. Recorded so the gap is a decision and not an
-- oversight: an operator who reaches the database directly can publish. So can
-- one who reaches the payouts table directly. The boundary is the console.
-- =============================================================================

CREATE TYPE "public"."content_page_state" AS ENUM('draft', 'in_review', 'published', 'archived');--> statement-breakpoint

CREATE TABLE content_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  title text NOT NULL,
  state content_page_state NOT NULL DEFAULT 'draft',

  -- What an editor is working on. Present even for a published page, because
  -- opening a published page to fix a typo must not disturb what is served.
  draft_blocks jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- The revision visitors are served. Null until the page is first published.
  -- The foreign key is added after content_revisions exists — the two tables
  -- reference each other, which is correct: a page names its live revision and
  -- a revision names the page it belongs to.
  published_revision_id uuid,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Slugs are URLs and URLs are forever. Lowercase Latin, digits and single
  -- hyphens — the same alphabet the catalogue uses, because a site with two
  -- slug conventions has one of them wrong. Mirrors `isUsableSlug` in the
  -- domain; the reserved-word list lives there, since it is a fact about the
  -- application's routes rather than about the data.
  CONSTRAINT content_pages_slug_shape CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT content_pages_slug_length CHECK (char_length(slug) BETWEEN 1 AND 80),
  CONSTRAINT content_pages_title_present CHECK (char_length(btrim(title)) > 0),

  -- Blocks are a JSON ARRAY, always. A page whose draft is an object or a
  -- string is not a page the renderer can walk, and the failure would surface
  -- as a blank screen rather than as a bad row.
  CONSTRAINT content_pages_draft_is_array CHECK (jsonb_typeof(draft_blocks) = 'array')
);--> statement-breakpoint

CREATE UNIQUE INDEX content_pages_slug_key ON content_pages (slug);--> statement-breakpoint

CREATE TABLE content_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES content_pages(id) ON DELETE CASCADE,

  -- The title is snapshotted alongside the blocks. A page renamed after
  -- publishing must not retroactively rename what was published.
  title text NOT NULL,
  blocks jsonb NOT NULL,

  -- Who published it and when. Not nullable: a revision exists because somebody
  -- published it, and a revision with no author is a revision nobody can be
  -- asked about.
  published_by uuid NOT NULL REFERENCES platform_staff(id),
  published_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT content_revisions_blocks_is_array CHECK (jsonb_typeof(blocks) = 'array'),
  CONSTRAINT content_revisions_blocks_present CHECK (jsonb_array_length(blocks) > 0)
);--> statement-breakpoint

CREATE INDEX content_revisions_page_idx ON content_revisions (page_id, published_at DESC);--> statement-breakpoint

ALTER TABLE content_pages
  ADD CONSTRAINT content_pages_published_revision_fk
  FOREIGN KEY (published_revision_id) REFERENCES content_revisions(id)
  -- RESTRICT, not CASCADE. Deleting the revision a live page serves would take
  -- the page down silently; this makes it an error the operator has to answer.
  ON DELETE RESTRICT;--> statement-breakpoint

/*
 * A revision is IMMUTABLE, and the database says so rather than trusting every
 * future caller to remember.
 *
 * The entire guarantee — that what a visitor read yesterday is still what the
 * page published yesterday — rests on nothing ever rewriting these rows. An
 * UPDATE here would be indistinguishable from a correction, and would silently
 * rewrite history for anybody who cited the page.
 */
CREATE OR REPLACE FUNCTION app.refuse_revision_rewrite() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'content revisions are immutable; publish a new one'
    USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint

CREATE TRIGGER content_revisions_immutable
  BEFORE UPDATE ON content_revisions
  FOR EACH ROW EXECUTE FUNCTION app.refuse_revision_rewrite();--> statement-breakpoint

-- =============================================================================
-- Row-level security
-- =============================================================================

ALTER TABLE content_pages ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE content_pages FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE content_revisions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE content_revisions FORCE ROW LEVEL SECURITY;--> statement-breakpoint

/*
 * The public reads a page only when it is genuinely live.
 *
 * Both conditions, not either: a page in `draft` that has published before is
 * still live and must stay readable, and an `archived` page that still names a
 * revision must not be. Writing this as `state = 'published'` would take a page
 * off the site the moment an editor opened it to fix a typo — which is the
 * exact failure the draft/revision split exists to prevent, reintroduced one
 * layer down.
 */
CREATE POLICY public_read_live_pages ON content_pages
  FOR SELECT USING (
    published_revision_id IS NOT NULL AND state <> 'archived'
  );--> statement-breakpoint

-- And the revision itself, reachable only through a page that is live. A
-- visitor can read what is published; they cannot enumerate the history.
CREATE POLICY public_read_served_revisions ON content_revisions
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM content_pages p
     WHERE p.published_revision_id = content_revisions.id
       AND p.state <> 'archived'
  ));--> statement-breakpoint

CREATE POLICY platform_manage_pages ON content_pages
  FOR ALL USING (app.is_platform()) WITH CHECK (app.is_platform());--> statement-breakpoint

CREATE POLICY platform_manage_revisions ON content_revisions
  FOR ALL USING (app.is_platform()) WITH CHECK (app.is_platform());--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON content_pages TO app_user;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON content_revisions TO app_user;
