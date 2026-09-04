-- =============================================================================
-- 0010 — Listing moderation, and the door that was open
--
-- THE DEFECT THIS CLOSES. `seller_manage_own_products` (0002) is `FOR ALL` with
-- `WITH CHECK (seller_id = app.staff_seller_id())`. It checks WHOSE row it is
-- and nothing else — so a house could set `status = 'published'` on its own
-- product and put it on the shopfront without moderation ever seeing it.
--
-- Nothing exploited it, because until now nothing but the seed wrote to
-- `products`. That is not a defence: the policy is what the database promises,
-- and it was promising the wrong thing while a comment two files away said
-- moderation stands between a listing and the shop.
--
-- WHY A TRIGGER AND NOT A TIGHTER POLICY. An RLS policy sees OLD in `USING` and
-- NEW in `WITH CHECK`, and never both at once — so it cannot express "a seller
-- may change anything EXCEPT the status". Writing `WITH CHECK (status <>
-- 'published')` would have been the obvious tightening and it would have
-- stopped a house editing the price of its own live listing, because the new
-- row still carries the status it already had.
--
-- A trigger sees both rows and the actor, which is exactly the comparison the
-- rule is about.
--
-- Doc 06 §4: "Material product, price, formulation, size or fulfilment changes
-- create an auditable revision." That revision trail is §6 of the work plan and
-- is not built yet; this migration is the gate, not the ledger.
-- =============================================================================

CREATE TYPE "public"."moderation_reason" AS ENUM(
  'prohibited_claim',
  'missing_required_fields',
  'unsupported_claim',
  'misleading_media',
  'implausible_pricing',
  'duplicate_listing',
  'restricted_ingredient'
);--> statement-breakpoint

ALTER TABLE products
  -- Why it was sent back or taken down. Coded, never free text (doc 06 §7):
  -- a thousand rows of "please fix" tell the platform nothing about which
  -- houses need help and which need chasing.
  ADD COLUMN moderation_reason moderation_reason,
  -- When the house asked, and when a person answered. Both, because the gap
  -- between them is the only measure of whether moderation is keeping up.
  ADD COLUMN submitted_at timestamptz,
  ADD COLUMN moderated_at timestamptz,
  ADD COLUMN moderated_by uuid REFERENCES platform_staff(id);--> statement-breakpoint

-- The moderation queue is read by `submitted_at`, oldest first, and a partial
-- index keeps it proportional to the queue rather than to the catalogue.
CREATE INDEX products_awaiting_moderation_idx
  ON products (submitted_at)
  WHERE status = 'pending_moderation';--> statement-breakpoint

/*
 * A house may not put its own listing on the shopfront.
 *
 * `published` and `suspended` are platform decisions. A house moves its listing
 * between `draft`, `pending_moderation` and `archived` and no further — which
 * is exactly the transition table in `packages/domain/src/catalogue/listing.ts`,
 * expressed a second time here on purpose.
 *
 * ENGINEERING_PRINCIPLES §4 calls that deliberate duplication: one place to
 * read the rule, one place it cannot be evaded. The domain is the readable
 * copy; this is the one that holds when somebody reaches the database another
 * way.
 */
CREATE OR REPLACE FUNCTION app.guard_listing_status() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Only a seller is constrained. The platform moves listings for a living,
  -- and the seed runs as `platform` before any staff row exists.
  IF app.actor_role() <> 'seller' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('published', 'suspended') THEN
      RAISE EXCEPTION 'A seller may not create a listing as %', NEW.status
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  -- An UPDATE that does not touch the status is none of this rule's business.
  -- Without this check a house could not edit the price of its own live
  -- listing, which is a legitimate thing to do and the reason a policy could
  -- not express this.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('published', 'suspended') THEN
    RAISE EXCEPTION 'A seller may not move a listing to %', NEW.status
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER products_status_guard
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION app.guard_listing_status();--> statement-breakpoint

/*
 * A house reads its own listing in every state; the public reads published
 * ones. Both policies already exist (0002) and neither changes — what changes
 * is that the seller's write is now bounded by the trigger above rather than by
 * ownership alone.
 *
 * The platform needs to see the queue, which its existing `platform` policies
 * on `products` already permit.
 */
