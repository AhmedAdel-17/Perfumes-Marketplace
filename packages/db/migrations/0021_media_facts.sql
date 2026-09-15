-- =============================================================================
-- 0021 — What a stored photograph actually is
--
-- `product_media` recorded a storage path, alt text, a primary flag and an
-- ownership confirmation — and nothing about the file. So a page could not
-- reserve the right-shaped space for a photograph before it loaded (the layout
-- jumps), and nothing could say whether a row pointed at a verified upload or
-- at a path somebody typed.
--
-- The four facts are READ FROM THE FILE by the server after it arrives
-- (`sniffImage` in the domain), never taken from what the browser declared.
--
-- ALL OR NONE. Rows written before the upload flow existed — the seeder and the
-- test fixtures — name paths with no file behind them and carry none of these.
-- A row with all four is a verified upload; a row with none is not, and the
-- shop keeps drawing the illustrated flacon for it rather than rendering a
-- broken image. What the CHECK forbids is the half-written row: a size with no
-- dimensions is neither, and nothing can decide how to show it.
-- =============================================================================

ALTER TABLE product_media
  ADD COLUMN content_type text,
  ADD COLUMN byte_size integer,
  ADD COLUMN width integer,
  ADD COLUMN height integer;

-- The `IS NOT NULL` terms are NOT redundant, and removing them reopens a hole.
--
-- A CHECK rejects a row only when its expression is FALSE. With a NULL width,
-- `width > 0` is NULL, the second branch is NULL, `false OR NULL` is NULL — and
-- NULL passes. The first version of this constraint was written without them
-- and accepted exactly the half-written row it existed to refuse; the test for
-- that case failed on its first run.
ALTER TABLE product_media
  ADD CONSTRAINT product_media_facts_all_or_none CHECK (
    (content_type IS NULL AND byte_size IS NULL AND width IS NULL AND height IS NULL)
    OR (
      content_type IS NOT NULL AND content_type IN ('image/jpeg', 'image/png', 'image/webp')
      AND byte_size IS NOT NULL AND byte_size > 0
      AND width IS NOT NULL AND width > 0
      AND height IS NOT NULL AND height > 0
    )
  );

-- One primary photograph per product.
--
-- Nothing stopped two, and "which one is the primary" then depended on which row
-- a query happened to return first — on the shopfront, the moderation queue and
-- the publish check alike. A partial unique index makes the second one an error
-- instead of a coin toss.
CREATE UNIQUE INDEX product_media_one_primary
  ON product_media (product_id)
  WHERE is_primary;
