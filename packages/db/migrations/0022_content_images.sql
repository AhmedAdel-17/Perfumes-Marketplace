-- =============================================================================
-- 0022 — the images an editorial page may show (WORK_PLAN 5.7.6)
--
-- An image block stores a key into the media store (`ImageBlock.mediaKey`).
-- Until now nothing recorded which keys were images: the console accepted any
-- text, and whatever was typed was saved, previewed and published. A key to
-- nothing drew a placeholder on the public site; a key to a house's product
-- photograph drew that photograph on a page nobody had reviewed it for.
--
-- A row here is written only after the server has read the uploaded bytes —
-- the same verification a product photograph gets (0021) — and a page may not
-- be published with an image block whose key has no row.
--
-- Not `product_media` with a nullable product: that table's publish trigger,
-- its one-primary index and its seller policies all mean "a product's
-- photograph", and an image belonging to no product would have to be an
-- exception to every one of them.
-- =============================================================================

CREATE TABLE content_images (
  -- The key IS the identity: blocks refer to images by key, and a surrogate id
  -- nobody refers to would be one more thing to keep consistent.
  storage_key text PRIMARY KEY,

  -- Every fact NOT NULL, rather than CHECKed: a CHECK passes on NULL, and a
  -- half-written row is exactly what a CHECK was meant to stop (see 0021).
  content_type text NOT NULL,
  byte_size integer NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,

  -- Uploading content is attributable, like publishing it.
  uploaded_by uuid NOT NULL REFERENCES platform_staff(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),

  -- The shape the server issues, and no other: an operator's session cannot
  -- record a product photograph's key, or a path outside the store, as content.
  CONSTRAINT content_images_key_shape
    CHECK (storage_key ~ '^content/[0-9a-z-]+/[0-9a-f]{24}\.(jpg|png|webp)$'),
  CONSTRAINT content_images_type
    CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT content_images_byte_size
    CHECK (byte_size > 0 AND byte_size <= 10485760),
  CONSTRAINT content_images_dimensions
    CHECK (width > 0 AND height > 0)
);--> statement-breakpoint

-- =============================================================================
-- Row-level security
-- =============================================================================

ALTER TABLE content_images ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE content_images FORCE ROW LEVEL SECURITY;--> statement-breakpoint

/*
 * The public reads an image only while a LIVE page is serving it.
 *
 * Not every image: an upload for a page still in draft is unpublished content,
 * and its facts — that it exists, its size, who uploaded it — are nobody's
 * business until the page is. The test is the same one the revision policy uses
 * (0009): the page's served revision, on a page that is not archived, contains
 * an image block with exactly this key. The subqueries run under the visitor's
 * own policies, so they can only ever see served revisions anyway.
 */
CREATE POLICY public_read_served_content_images ON content_images
  FOR SELECT USING (EXISTS (
    SELECT 1
      FROM content_pages p
      JOIN content_revisions r ON r.id = p.published_revision_id
     WHERE p.state <> 'archived'
       AND r.blocks @> jsonb_build_array(
             jsonb_build_object('kind', 'image', 'mediaKey', content_images.storage_key))
  ));--> statement-breakpoint

CREATE POLICY platform_manage_content_images ON content_images
  FOR ALL USING (app.is_platform()) WITH CHECK (app.is_platform());--> statement-breakpoint

-- No UPDATE path is used — a record is written once, from the bytes — but the
-- grant matches the other content tables so the platform policy governs it.
GRANT SELECT, INSERT, UPDATE, DELETE ON content_images TO app_user;
