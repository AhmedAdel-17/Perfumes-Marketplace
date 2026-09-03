-- =============================================================================
-- 0003 — The checkout service role
--
-- WHAT THIS FIXES. The schema always anticipated guest checkout — `customers`
-- carries "Null while the record exists only from guest checkout" — but 0002
-- gave that path no way to write. Every customer policy is keyed on
-- `app.customer_id()`, which resolves from an authenticated user, and a guest
-- has none. So placing an order was impossible for exactly the visitor the
-- product is designed around. Found by writing the test, not by reading 0002.
--
-- WHY NOT SIMPLY ALLOW `anon` TO INSERT. Because `INSERT ... RETURNING` and
-- `ON CONFLICT DO UPDATE` also require SELECT and UPDATE policies to be
-- satisfied, and granting those to `anon` on `customers` would let any visitor
-- read and overwrite every customer row in the system. The convenient fix here
-- is a catastrophic one.
--
-- WHAT THIS IS INSTEAD. `checkout` is a SERVICE role, not a user role. It is
-- set only inside the order-placement transaction on the server, after the
-- router has validated everything, and it can be reached from a browser exactly
-- never. It may create a customer and an order and read back what it just
-- wrote. It may not read anything else, and it may not touch payouts,
-- verifications, seller data or anyone else's orders — a bug in the placement
-- code cannot become a data breach.
--
-- The narrowness is the point: this is least privilege for one operation, not a
-- second platform role.
-- =============================================================================

/** True inside the order-placement transaction, and nowhere else. */
CREATE OR REPLACE FUNCTION app.is_checkout() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT app.actor_role() = 'checkout' $$;


-- -----------------------------------------------------------------------------
-- customers — find-or-create by phone
--
-- SELECT is required because `INSERT ... RETURNING` applies SELECT policies to
-- the returned row, and UPDATE because a returning guest hits ON CONFLICT.
-- Without all three, checkout works for a first-time customer and fails for a
-- repeat one, which is the worst possible split.
-- -----------------------------------------------------------------------------
CREATE POLICY checkout_insert_customers ON customers
  FOR INSERT WITH CHECK (app.is_checkout());

CREATE POLICY checkout_select_customers ON customers
  FOR SELECT USING (app.is_checkout());

CREATE POLICY checkout_update_customers ON customers
  FOR UPDATE USING (app.is_checkout()) WITH CHECK (app.is_checkout());


-- -----------------------------------------------------------------------------
-- orders, sub-orders, line items
--
-- All three are written in ONE transaction. A partially written multi-seller
-- order is unrecoverable, so a policy that admits the parent and refuses a
-- child would be worse than refusing the whole thing.
-- -----------------------------------------------------------------------------
CREATE POLICY checkout_insert_orders ON orders
  FOR INSERT WITH CHECK (app.is_checkout());

CREATE POLICY checkout_select_orders ON orders
  FOR SELECT USING (app.is_checkout());

CREATE POLICY checkout_insert_sub_orders ON sub_orders
  FOR INSERT WITH CHECK (app.is_checkout());

CREATE POLICY checkout_select_sub_orders ON sub_orders
  FOR SELECT USING (app.is_checkout());

CREATE POLICY checkout_insert_line_items ON order_line_items
  FOR INSERT WITH CHECK (app.is_checkout());

CREATE POLICY checkout_select_line_items ON order_line_items
  FOR SELECT USING (app.is_checkout());


-- -----------------------------------------------------------------------------
-- Attribution touches
--
-- Not written yet — touch capture is a later phase — but the policy lands with
-- the rest of the checkout path so the day it starts writing is not the day
-- someone rediscovers this whole class of problem.
-- -----------------------------------------------------------------------------
CREATE POLICY checkout_insert_touches ON attribution_touches
  FOR INSERT WITH CHECK (app.is_checkout());


-- -----------------------------------------------------------------------------
-- Reading a placed order back
--
-- Order lookup is reference AND phone, so the read is not authenticated in the
-- session sense. It runs under `checkout` too, and the router — not the
-- database — is what requires both factors before it will look anything up.
-- Recorded here because it is the one place where a policy is deliberately
-- broader than the rule it enforces.
-- -----------------------------------------------------------------------------
