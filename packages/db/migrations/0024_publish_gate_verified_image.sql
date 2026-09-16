-- =============================================================================
-- 0024 — the publish gate asks for an image the SHOP can actually render
--
-- WHAT QA FOUND. A published perfume whose own editor said "هذه الصورة لم تُرفع
-- بالطريقة المعتمدة ولا يمكن عرضها", and a shop drawing the illustrated flacon
-- in its place. Both screens were right, and they disagreed because two rules
-- described one thing:
--
--   * 0001's publish gate admits a listing when a `product_media` row is
--     primary, has confirmed ownership and carries alt text;
--   * 0021 added the FACTS a file actually has — content type, byte size,
--     width, height — and the storefront renders only rows that carry them,
--     because a row without them names a path with no verified file behind it.
--
-- So a listing could pass the gate holding an image nothing would ever show.
-- The gate promised "a primary image"; what it checked was a row.
--
-- This re-declares the function with one clause added: `content_type IS NOT
-- NULL`, which by 0021's all-or-none CHECK means every fact is present. The
-- missing-field NAME is unchanged, so `publish-gate-parity.test.ts` still holds
-- the trigger and the domain's `listingGaps` to the same list.
--
-- WHAT THIS BREAKS, deliberately: a listing whose only primary image predates
-- the upload flow can no longer be published or re-published until a real
-- photograph is uploaded. That is the point — it could not be SHOWN either.
-- =============================================================================

CREATE OR REPLACE FUNCTION enforce_publish_gate()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  missing text[] := ARRAY[]::text[];
BEGIN
  IF NEW.status NOT IN ('published', 'pending_moderation') THEN
    RETURN NEW;                                   -- drafts may be incomplete
  END IF;

  -- product group
  IF NEW.concentration        IS NULL THEN missing := array_append(missing, 'concentration'); END IF;
  IF NEW.form                 IS NULL THEN missing := array_append(missing, 'form'); END IF;
  IF NEW.gender_positioning   IS NULL THEN missing := array_append(missing, 'gender_positioning'); END IF;
  IF NEW.scent_family         IS NULL THEN missing := array_append(missing, 'scent_family'); END IF;
  IF coalesce(array_length(NEW.notes_top, 1), 0)   = 0 THEN missing := array_append(missing, 'notes_top'); END IF;
  IF coalesce(array_length(NEW.notes_heart, 1), 0) = 0 THEN missing := array_append(missing, 'notes_heart'); END IF;
  IF coalesce(array_length(NEW.notes_base, 1), 0)  = 0 THEN missing := array_append(missing, 'notes_base'); END IF;

  -- use group
  IF coalesce(array_length(NEW.seasons, 1), 0)   = 0 THEN missing := array_append(missing, 'seasons'); END IF;
  IF coalesce(array_length(NEW.occasions, 1), 0) = 0 THEN missing := array_append(missing, 'occasions'); END IF;
  IF NEW.day_night        IS NULL THEN missing := array_append(missing, 'day_night'); END IF;
  IF NEW.projection_band  IS NULL THEN missing := array_append(missing, 'projection_band'); END IF;
  IF NEW.longevity_band   IS NULL THEN missing := array_append(missing, 'longevity_band'); END IF;

  -- a performance band without a disclosed source is a seller claim dressed as fact
  IF (NEW.projection_band IS NOT NULL OR NEW.longevity_band IS NOT NULL)
     AND NEW.performance_source IS NULL THEN
    missing := array_append(missing, 'performance_source');
  END IF;

  -- compliance and policy groups
  IF NEW.responsible_party_name IS NULL OR btrim(NEW.responsible_party_name) = ''
    THEN missing := array_append(missing, 'responsible_party_name'); END IF;
  IF NEW.return_eligibility IS NULL THEN missing := array_append(missing, 'return_eligibility'); END IF;
  IF NEW.defect_route IS NULL OR btrim(NEW.defect_route) = ''
    THEN missing := array_append(missing, 'defect_route'); END IF;

  -- media: a primary image whose ownership the seller has confirmed, AND whose
  -- file the server has actually read (0021). Without the last clause the gate
  -- admits a row the storefront refuses to render.
  IF NOT EXISTS (
    SELECT 1 FROM product_media
    WHERE product_id = NEW.id AND is_primary AND ownership_confirmed
          AND btrim(alt_text) <> ''
          AND content_type IS NOT NULL
  ) THEN
    missing := array_append(missing, 'primary_image_with_confirmed_ownership_and_alt_text');
  END IF;

  IF array_length(missing, 1) > 0 THEN
    RAISE EXCEPTION 'Cannot publish: % required field(s) missing — %',
      array_length(missing, 1), array_to_string(missing, ', ')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;
