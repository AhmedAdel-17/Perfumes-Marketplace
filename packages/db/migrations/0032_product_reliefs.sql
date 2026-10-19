-- =============================================================================
-- 0032 — A perfume's relief: its bottle lifted out of its photograph
--        (Le Dévoilement — founder, 18–19 Oct 2026)
--
-- From one product photograph the console makes three things the storefront
-- needs to stand the bottle up and light it (`makeRelief` in the domain):
-- a CUT-OUT (the bottle alone, upright, its glass see-through), a RELIEF MAP
-- (how far each pixel stands out), and a PLACEMENT (where the cut-out sat in
-- the photograph, so the object can be laid exactly over the picture before it
-- is lifted out of it). The two images are files in the media store; this row
-- records what they are and where the bottle was.
--
-- WHO MAKES ONE: the platform's content team (founder, 19 Oct 2026) — the
-- same people who keep the notes glossary. So the platform writes, a house
-- may READ its own (its portal can show it, and removing a photograph can
-- clean up the files), and the public reads only a published perfume's.
--
-- ONE PER PHOTOGRAPH, not per product. The placement is a fact about one
-- photograph; when the primary photograph changes, the storefront shows the
-- new one's relief, or none. When a photograph goes, its relief goes with it
-- (ON DELETE CASCADE — referential actions do not pass through row security).
--
-- rollback: DROP TABLE product_media_reliefs; then remove the `reliefs/` files
-- from the media store. Nothing else refers to this table.
-- =============================================================================

CREATE TABLE product_media_reliefs (
  media_id uuid PRIMARY KEY REFERENCES product_media(id) ON DELETE CASCADE,

  -- Both files, PNG, under the platform's own prefix — never `products/`, which
  -- is a house's upload with a house's policies.
  cutout_key text NOT NULL,
  relief_key text NOT NULL,

  -- Read from the files' own bytes by the server (0021's rule), and the same
  -- for both: the relief map is pixel for pixel the cut-out's.
  width integer NOT NULL,
  height integer NOT NULL,
  cutout_bytes integer NOT NULL,
  relief_bytes integer NOT NULL,

  -- Where the cut-out sat: its centre and height in MILLIONTHS of the
  -- photograph, and the counter-clockwise turn that lays it back down in
  -- HUNDREDTHS of a degree. Integers, because this schema holds no floating
  -- point anywhere (parity.test.ts) — and a millionth of a photograph is far
  -- finer than a pixel, so nothing is lost by it.
  centre_x_ppm integer NOT NULL,
  centre_y_ppm integer NOT NULL,
  height_ppm integer NOT NULL,
  angle_centidegrees integer NOT NULL,

  -- How the outline was found, and whether the glass was made see-through.
  method text NOT NULL,
  opaque boolean NOT NULL,

  -- Making one is attributable, like every console decision about a listing.
  made_by uuid NOT NULL REFERENCES platform_staff(id),
  made_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT product_media_reliefs_key_shape CHECK (
    cutout_key ~ '^reliefs/[0-9a-f-]+/[0-9a-f]{24}\.png$'
    AND relief_key ~ '^reliefs/[0-9a-f-]+/[0-9a-f]{24}\.png$'
    AND cutout_key <> relief_key
  ),
  CONSTRAINT product_media_reliefs_dimensions CHECK (
    width BETWEEN 48 AND 4000 AND height BETWEEN 48 AND 4000
  ),
  CONSTRAINT product_media_reliefs_bytes CHECK (
    cutout_bytes > 0 AND cutout_bytes <= 8388608 AND relief_bytes > 0 AND relief_bytes <= 8388608
  ),
  CONSTRAINT product_media_reliefs_placement CHECK (
    centre_x_ppm BETWEEN 0 AND 1000000 AND centre_y_ppm BETWEEN 0 AND 1000000
    AND height_ppm > 0 AND height_ppm <= 2000000
    AND angle_centidegrees BETWEEN -18000 AND 18000
  ),
  CONSTRAINT product_media_reliefs_method CHECK (method IN ('automatic', 'traced'))
);--> statement-breakpoint

-- =============================================================================
-- Row-level security
-- =============================================================================

ALTER TABLE product_media_reliefs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE product_media_reliefs FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- The public: a published perfume's, exactly as for its photographs (0002).
CREATE POLICY public_read_reliefs ON product_media_reliefs
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM product_media m JOIN products p ON p.id = m.product_id
     WHERE m.id = product_media_reliefs.media_id AND p.status = 'published'));--> statement-breakpoint

-- A house: its own products' — to read, never to write.
CREATE POLICY seller_read_own_reliefs ON product_media_reliefs
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM product_media m JOIN products p ON p.id = m.product_id
     WHERE m.id = product_media_reliefs.media_id AND p.seller_id = app.staff_seller_id()));--> statement-breakpoint

CREATE POLICY platform_manage_reliefs ON product_media_reliefs
  FOR ALL USING (app.is_platform()) WITH CHECK (app.is_platform());--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON product_media_reliefs TO app_user;
