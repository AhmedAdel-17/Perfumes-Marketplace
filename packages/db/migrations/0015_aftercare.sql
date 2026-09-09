-- =============================================================================
-- 0015 — The aftercare service role
--
-- WHAT THIS FIXES. Everything that happens AFTER the parcel arrives — writing a
-- review, asking to return something, opening a support ticket — was reachable
-- only by an authenticated customer, and this marketplace has none. Every
-- customer policy in 0002 is keyed on `app.customer_id()`, which resolves from
-- a signed-in auth user; a guest has none, and guest checkout is the entire
-- product. So the homepage promised "تقييمات موثّقة بالشراء" and no visitor
-- could write one.
--
-- This is the same problem 0003 solved for placing an order, and it gets the
-- same shape of answer, deliberately: a narrow SERVICE role rather than a new
-- user role, rather than widening `checkout`, and rather than letting `anon`
-- write.
--
-- WHY NOT WIDEN `checkout`. Because its narrowness is what makes it safe to
-- reason about. "Can create a customer and an order and read back what it just
-- wrote" is a sentence somebody can check against the policies in one sitting.
-- A role that also writes reviews, returns and tickets is a role nobody audits.
--
-- WHY NOT LET `anon` WRITE. A review row carries `customer_id`, and an INSERT
-- policy that admits anonymous traffic admits a review attributed to any
-- customer id a request cares to name. The reads required to make the insert
-- meaningful would then be reads of every order in the system.
--
-- WHAT `aftercare` IS. It is set only inside the aftercare router's
-- transactions on the server, after the router has established the two factors
-- — the order reference and the phone it was placed on — and it is reachable
-- from a browser exactly never. It may read the order graph and write a review,
-- a return request or a ticket. It may not touch payouts, verifications,
-- seller records, listings or content.
--
-- THE SECOND HALF OF THE GUARANTEE IS NOT HERE. RLS answers "may this role
-- write a review at all"; it cannot answer "is this the right customer's
-- review", because at that point the role IS the authority. That question is
-- answered by the trigger extended at the bottom of this file, which refuses
-- any review whose customer is not the customer on the order — so even a
-- router bug cannot attribute a review to somebody who did not buy the bottle.
-- =============================================================================

/** True inside an aftercare transaction, and nowhere else. */
CREATE OR REPLACE FUNCTION app.is_aftercare() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT app.actor_role() = 'aftercare' $$;


-- -----------------------------------------------------------------------------
-- Reading the order graph
--
-- The reference-and-phone predicate lives in the WHERE clause of every
-- aftercare query, so these policies are deliberately broader than the rule
-- they serve — exactly as 0003's `checkout_select_orders` is, and recorded here
-- for the same reason. The router, not the database, is what requires both
-- factors before anything is looked up.
--
-- `products` and `brands` are readable to `anon` already when published; the
-- policies here cover the ones that are not, because a perfume that has since
-- been archived is still a perfume somebody received and may review.
-- -----------------------------------------------------------------------------
CREATE POLICY aftercare_select_orders ON orders
  FOR SELECT USING (app.is_aftercare());

CREATE POLICY aftercare_select_sub_orders ON sub_orders
  FOR SELECT USING (app.is_aftercare());

CREATE POLICY aftercare_select_line_items ON order_line_items
  FOR SELECT USING (app.is_aftercare());

CREATE POLICY aftercare_select_customers ON customers
  FOR SELECT USING (app.is_aftercare());

CREATE POLICY aftercare_select_products ON products
  FOR SELECT USING (app.is_aftercare());

CREATE POLICY aftercare_select_brands ON brands
  FOR SELECT USING (app.is_aftercare());

CREATE POLICY aftercare_select_sellers ON sellers
  FOR SELECT USING (app.is_aftercare());


-- -----------------------------------------------------------------------------
-- Reviews
--
-- SELECT as well as INSERT, because `INSERT ... RETURNING` applies the SELECT
-- policies to the row it returns — the same trap 0003 documents. Without it the
-- write succeeds and the router cannot tell the customer it did.
--
-- NO UPDATE and NO DELETE. A review is a statement somebody made about a
-- purchase on a date; editing one after the fact is a different feature with
-- different rules (an edit history, at minimum), and deleting one is the thing
-- doc 04 §3 forbids outright. The absence is the policy.
-- -----------------------------------------------------------------------------
CREATE POLICY aftercare_insert_reviews ON reviews
  FOR INSERT WITH CHECK (app.is_aftercare());

CREATE POLICY aftercare_select_reviews ON reviews
  FOR SELECT USING (app.is_aftercare());


-- -----------------------------------------------------------------------------
-- Returns
--
-- INSERT and SELECT only. A customer may ASK for a return; approving one,
-- allocating who bears the cost and setting a refund are decisions made by a
-- house or an operator, and a customer who could UPDATE this row could approve
-- their own refund.
-- -----------------------------------------------------------------------------
CREATE POLICY aftercare_insert_returns ON returns
  FOR INSERT WITH CHECK (app.is_aftercare());

CREATE POLICY aftercare_select_returns ON returns
  FOR SELECT USING (app.is_aftercare());


-- -----------------------------------------------------------------------------
-- Support tickets
--
-- Same shape. Opening a ticket is a customer's act; triage, priority, ownership
-- and resolution are the operator's, and none of them are writable here.
-- -----------------------------------------------------------------------------
CREATE POLICY aftercare_insert_tickets ON support_tickets
  FOR INSERT WITH CHECK (app.is_aftercare());

CREATE POLICY aftercare_select_tickets ON support_tickets
  FOR SELECT USING (app.is_aftercare());


-- -----------------------------------------------------------------------------
-- The review belongs to the person who bought the bottle
--
-- 0001 established two of the three facts a verified review depends on: the
-- sub-order was delivered, and the line item belongs to it. The third — that
-- the customer on the review is the customer on the order — was never checked
-- anywhere, because until now nothing could write a review at all.
--
-- It matters most under exactly the role this migration introduces. `aftercare`
-- IS the authority when it writes, so RLS cannot ask this question; a bug that
-- passed the wrong customer id would produce a review attributed to a stranger,
-- sitting under their masked name on a public page, and nothing would object.
--
-- Replacing the function rather than adding a second trigger keeps every rule
-- about what a review must be in one readable place.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_review_requires_delivery()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  s sub_order_state;
  buyer uuid;
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

  -- The product must be the one that was actually bought on that line. A
  -- review pointed at a different perfume would appear on a page nobody
  -- reviewed, which is the same lie as an unverified review wearing the badge.
  IF NOT EXISTS (
    SELECT 1 FROM order_line_items
    WHERE id = NEW.line_item_id AND product_id = NEW.product_id
  ) THEN
    RAISE EXCEPTION 'Review product does not match the line item that was bought';
  END IF;

  -- And the reviewer must be the buyer.
  SELECT o.customer_id INTO buyer
  FROM sub_orders s2 JOIN orders o ON o.id = s2.order_id
  WHERE s2.id = NEW.sub_order_id;

  IF buyer IS DISTINCT FROM NEW.customer_id THEN
    RAISE EXCEPTION 'A review must be written by the customer who placed the order'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;


-- -----------------------------------------------------------------------------
-- A return is asked for against a line item that was actually on the order
--
-- `returns.line_item_id` is nullable — a whole-parcel return names no line —
-- but when it is set it must belong to the sub-order, for the same reason the
-- review rule exists: otherwise a house is asked to take back something it
-- never sent.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_return_line_belongs()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.line_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM order_line_items
    WHERE id = NEW.line_item_id AND sub_order_id = NEW.sub_order_id
  ) THEN
    RAISE EXCEPTION 'Return line item does not belong to the referenced sub-order'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER returns_line_belongs
  BEFORE INSERT OR UPDATE ON returns
  FOR EACH ROW EXECUTE FUNCTION enforce_return_line_belongs();
