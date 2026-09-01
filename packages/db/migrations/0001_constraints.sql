-- =============================================================================
-- 0001 — Constraints, gates and the audit trail
--
-- Everything here exists because a founding document says it must be true, and
-- because a rule enforced only in the UI is not enforced. CLAUDE.md §4:
-- "Enforce at the database level, not just the UI."
--
-- Written 1 September 2026. Run after 0000_initial.sql.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Money is always integer piastres, and never silently negative
-- -----------------------------------------------------------------------------
ALTER TABLE products
  ADD CONSTRAINT products_price_positive       CHECK (price_piastres > 0),
  ADD CONSTRAINT products_promo_valid          CHECK (promo_price_piastres IS NULL
                                                      OR (promo_price_piastres > 0
                                                          AND promo_price_piastres < price_piastres)),
  ADD CONSTRAINT products_stock_non_negative   CHECK (stock >= 0),
  ADD CONSTRAINT products_volume_positive      CHECK (volume_ml > 0);

ALTER TABLE orders
  ADD CONSTRAINT orders_merchandise_non_negative CHECK (merchandise_piastres >= 0),
  ADD CONSTRAINT orders_shipping_non_negative    CHECK (shipping_piastres >= 0),
  ADD CONSTRAINT orders_total_reconciles
    CHECK (total_piastres = merchandise_piastres + shipping_piastres - discount_piastres);

ALTER TABLE order_line_items
  ADD CONSTRAINT line_items_quantity_positive CHECK (quantity > 0),
  -- basis points: 0%–100%. A rate outside this range is a bug, not a policy.
  ADD CONSTRAINT line_items_bps_sane          CHECK (commission_bps BETWEEN 0 AND 10000),
  ADD CONSTRAINT line_items_line_reconciles
    CHECK (line_piastres = unit_price_piastres * quantity);

ALTER TABLE payout_lines
  ADD CONSTRAINT payout_lines_bps_sane CHECK (commission_bps BETWEEN 0 AND 10000),
  ADD CONSTRAINT payout_lines_net_reconciles
    CHECK (net_piastres = gross_piastres - commission_piastres);

ALTER TABLE commission_rule_sets
  ADD CONSTRAINT rule_set_bps_sane CHECK (
    storefront_referral_bps BETWEEN 0 AND 10000 AND
    direct_repeat_bps       BETWEEN 0 AND 10000 AND
    organic_search_bps      BETWEEN 0 AND 10000 AND
    paid_campaign_bps       BETWEEN 0 AND 10000 AND
    creator_affiliate_bps   BETWEEN 0 AND 10000 AND
    email_crm_bps           BETWEEN 0 AND 10000 AND
    unknown_bps             BETWEEN 0 AND 10000
  ),
  -- Doc 04 §9: neither founder changes marketplace economics alone.
  ADD CONSTRAINT rule_set_two_approvers CHECK (array_length(approved_by, 1) >= 2);

ALTER TABLE reviews
  ADD CONSTRAINT reviews_ratings_in_range CHECK (
    rating_scent                BETWEEN 1 AND 5 AND
    rating_longevity            BETWEEN 1 AND 5 AND
    rating_projection           BETWEEN 1 AND 5 AND
    rating_value                BETWEEN 1 AND 5 AND
    rating_packaging            BETWEEN 1 AND 5 AND
    rating_description_accuracy BETWEEN 1 AND 5
  );

-- Egyptian mobile number, E.164 or local form. Phone is the identity anchor,
-- so a malformed one is a data-quality failure at the point of entry.
ALTER TABLE customers
  ADD CONSTRAINT customers_phone_shape CHECK (phone ~ '^(\+201|01)[0-2,5]{1}[0-9]{8}$');


-- -----------------------------------------------------------------------------
-- 2. Acceptance gate 5 — only a DELIVERED sub-order can produce a review
--
-- Doc 04 §8 and DATA_MODEL.md: "Enforce this as a database constraint, not
-- application logic." A cross-row rule cannot be a CHECK, so it is a trigger.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_review_requires_delivery()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  s sub_order_state;
BEGIN
  SELECT state INTO s FROM sub_orders WHERE id = NEW.sub_order_id;

  IF s IS NULL THEN
    RAISE EXCEPTION 'Review references a sub-order that does not exist';
  END IF;

  IF s <> 'delivered' THEN
    RAISE EXCEPTION
      'Acceptance gate 5: only a delivered sub-order can produce a verified-purchase review (sub-order is %)', s
      USING ERRCODE = 'check_violation';
  END IF;

  -- The line item must belong to the sub-order being reviewed.
  IF NOT EXISTS (
    SELECT 1 FROM order_line_items
    WHERE id = NEW.line_item_id AND sub_order_id = NEW.sub_order_id
  ) THEN
    RAISE EXCEPTION 'Review line item does not belong to the referenced sub-order';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER reviews_require_delivery
  BEFORE INSERT OR UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION enforce_review_requires_delivery();


-- -----------------------------------------------------------------------------
-- 3. No listing publishes with missing required fields
--
-- CLAUDE.md §4 and doc 06 §4. The Specification pattern in packages/domain is
-- the readable half of this rule; this is the half that cannot be bypassed.
-- -----------------------------------------------------------------------------
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

  -- media: a primary image whose ownership the seller has confirmed
  IF NOT EXISTS (
    SELECT 1 FROM product_media
    WHERE product_id = NEW.id AND is_primary AND ownership_confirmed
          AND btrim(alt_text) <> ''
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

CREATE TRIGGER products_publish_gate
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION enforce_publish_gate();


-- -----------------------------------------------------------------------------
-- 4. No self-approval path for sellers
--
-- DATA_MODEL.md: "A seller cannot reach `live` with an incomplete checklist.
-- There is no self-approval path." Eight controls, all approved, no override.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_seller_verification_complete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  approved int;
  total    int := 8;                              -- doc 06 §3
BEGIN
  IF NEW.status NOT IN ('approved', 'live') THEN
    RETURN NEW;
  END IF;
  IF OLD.status IN ('approved', 'live') THEN
    RETURN NEW;                                   -- already past the gate
  END IF;

  SELECT count(*) INTO approved
  FROM seller_verifications
  WHERE seller_id = NEW.id AND status = 'approved';

  IF approved < total THEN
    RAISE EXCEPTION
      'Seller cannot reach % with an incomplete checklist (% of % controls approved)',
      NEW.status, approved, total
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER sellers_verification_gate
  BEFORE UPDATE ON sellers
  FOR EACH ROW EXECUTE FUNCTION enforce_seller_verification_complete();


-- -----------------------------------------------------------------------------
-- 5. Append-only ledgers
--
-- Acceptance gate 6. DATA_MODEL.md: "Retrofitting an audit log is not feasible."
-- These tables accept INSERT and nothing else — including from the owner role.
-- -----------------------------------------------------------------------------
-- Statement-level: FOR EACH ROW would not fire on an empty table, leaving a
-- DELETE against an empty ledger silently permitted.
CREATE OR REPLACE FUNCTION forbid_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $$;

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER sub_order_transitions_append_only
  BEFORE UPDATE OR DELETE ON sub_order_transitions
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER product_revisions_append_only
  BEFORE UPDATE OR DELETE ON product_revisions
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER consent_records_append_only
  BEFORE UPDATE OR DELETE ON consent_records
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();


-- -----------------------------------------------------------------------------
-- 6. Sub-order transitions must follow the state machine
--
-- The same table that lives in packages/domain/src/state-machines/sub-order.ts.
-- Duplicated deliberately: the domain is where it is readable and tested, the
-- database is where it cannot be bypassed by a bad migration or a stray script.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_sub_order_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  legal boolean;
BEGIN
  IF OLD.state = NEW.state THEN
    RETURN NEW;
  END IF;

  legal := (OLD.state, NEW.state) IN (
    ('placed',          'awaiting_seller'),
    ('awaiting_seller', 'confirmed'),
    ('awaiting_seller', 'rejected'),
    ('awaiting_seller', 'cancelled'),
    ('confirmed',       'dispatched'),
    ('confirmed',       'cancelled'),
    ('dispatched',      'delivered'),
    ('dispatched',      'refused'),
    ('delivered',       'returned')
  );

  IF NOT legal THEN
    RAISE EXCEPTION 'Illegal sub-order transition: % → %', OLD.state, NEW.state
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER sub_orders_state_machine
  BEFORE UPDATE ON sub_orders
  FOR EACH ROW EXECUTE FUNCTION enforce_sub_order_transition();


-- -----------------------------------------------------------------------------
-- 7. Commission is charged only on completed orders (doc 03 §8)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_commission_on_completed_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  s sub_order_state;
BEGIN
  SELECT state INTO s FROM sub_orders WHERE id = NEW.sub_order_id;

  IF s <> 'delivered' AND NEW.commission_piastres <> 0 THEN
    RAISE EXCEPTION
      'Commission may only be charged on a completed order (sub-order is %)', s
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER payout_lines_completed_only
  BEFORE INSERT OR UPDATE ON payout_lines
  FOR EACH ROW EXECUTE FUNCTION enforce_commission_on_completed_only();


-- -----------------------------------------------------------------------------
-- 8. Seed the verification checklist whenever a seller applies
--
-- Eight rows created up front so "6 of 8" is a query, not a calculation, and so
-- a control can never be silently skipped by never being created.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seed_seller_verifications()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO seller_verifications (seller_id, control, status)
  SELECT NEW.id, c, 'pending'
  FROM unnest(enum_range(NULL::verification_control)) AS c;
  RETURN NEW;
END $$;

CREATE TRIGGER sellers_seed_verifications
  AFTER INSERT ON sellers
  FOR EACH ROW EXECUTE FUNCTION seed_seller_verifications();
