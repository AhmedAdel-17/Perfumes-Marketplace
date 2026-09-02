-- =============================================================================
-- 0002 — Row-Level Security
--
-- TECH_STACK.md: "Seller data isolation — Postgres RLS, enforced by the
-- database, not app code." Role-based access is an MVP requirement (doc 04 §1),
-- and "seller staff must not see what seller owners see" (CLAUDE.md §3).
--
-- Every policy here is proved by a test that attempts the forbidden read.
--
-- FORCE ROW LEVEL SECURITY is applied so the policies bind the table OWNER too.
-- Without it a compromised service role — or a stray migration script — silently
-- bypasses every rule below.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS app;

-- -----------------------------------------------------------------------------
-- Actor context
--
-- In Supabase these read auth.uid() and a JWT claim. They are written against
-- session settings so the same policies can be executed and tested anywhere,
-- which is what makes the security assertions runnable in CI.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.actor_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.actor_id', true), '')::uuid
$$;

/** 'anon' | 'customer' | 'seller' | 'platform' */
CREATE OR REPLACE FUNCTION app.actor_role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('app.actor_role', true), ''), 'anon')
$$;

CREATE OR REPLACE FUNCTION app.is_platform() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT app.actor_role() = 'platform' $$;

/** The seller this staff member belongs to, if any. NULL otherwise. */
CREATE OR REPLACE FUNCTION app.staff_seller_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT seller_id FROM seller_staff
  WHERE auth_user_id = app.actor_id() AND revoked_at IS NULL
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app.staff_role() RETURNS staff_role
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM seller_staff
  WHERE auth_user_id = app.actor_id() AND revoked_at IS NULL
  LIMIT 1
$$;

/** Money is owner-only. A fulfilment clerk has no business seeing payouts. */
CREATE OR REPLACE FUNCTION app.is_seller_owner() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT app.staff_role() = 'owner' $$;

/** The customer row belonging to the signed-in user. */
CREATE OR REPLACE FUNCTION app.customer_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM customers WHERE auth_user_id = app.actor_id() LIMIT 1
$$;


-- -----------------------------------------------------------------------------
-- Enable + force on every table holding seller, customer or money data
-- -----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customers','customer_addresses','sellers','seller_verifications','seller_staff',
    'brands','products','product_media','product_revisions',
    'orders','attribution_touches','sub_orders','sub_order_transitions','order_line_items',
    'shipments','shipment_events','returns',
    'commission_rule_sets','commission_overrides','payouts','payout_lines','adjustments',
    'reviews','audit_log','consent_records','privacy_requests','analytics_events',
    'webhook_events','support_tickets'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
  END LOOP;
END $$;


-- -----------------------------------------------------------------------------
-- Platform operators
--
-- One blanket policy per table rather than a superuser bypass, so that every
-- platform action still runs through RLS and remains attributable.
-- -----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customers','customer_addresses','sellers','seller_verifications','seller_staff',
    'brands','products','product_media','product_revisions',
    'orders','attribution_touches','sub_orders','sub_order_transitions','order_line_items',
    'shipments','shipment_events','returns',
    'commission_rule_sets','commission_overrides','payouts','payout_lines','adjustments',
    'reviews','audit_log','consent_records','privacy_requests','analytics_events',
    'webhook_events','support_tickets'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY platform_all ON %I FOR ALL USING (app.is_platform()) WITH CHECK (app.is_platform())', t);
  END LOOP;
END $$;


-- -----------------------------------------------------------------------------
-- Public catalogue
--
-- Anonymous visitors are the majority of traffic and the SEO surface. They may
-- read live houses and published listings, and nothing else.
-- -----------------------------------------------------------------------------
CREATE POLICY public_read_live_sellers ON sellers
  FOR SELECT USING (status = 'live');

CREATE POLICY public_read_published_products ON products
  FOR SELECT USING (status = 'published');

CREATE POLICY public_read_brands ON brands
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM sellers s WHERE s.id = brands.seller_id AND s.status = 'live'));

CREATE POLICY public_read_media ON product_media
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM products p WHERE p.id = product_media.product_id AND p.status = 'published'));

-- Doc 06 §10: moderation removes abuse, not criticism. Hidden reviews stay hidden.
CREATE POLICY public_read_reviews ON reviews
  FOR SELECT USING (hidden_at IS NULL);


-- -----------------------------------------------------------------------------
-- Sellers — a house sees its own data and nothing else
-- -----------------------------------------------------------------------------
CREATE POLICY seller_read_own ON sellers
  FOR SELECT USING (id = app.staff_seller_id());
CREATE POLICY seller_update_own ON sellers
  FOR UPDATE USING (id = app.staff_seller_id() AND app.is_seller_owner())
  WITH CHECK (id = app.staff_seller_id());

CREATE POLICY seller_read_own_verifications ON seller_verifications
  FOR SELECT USING (seller_id = app.staff_seller_id());

CREATE POLICY seller_read_own_staff ON seller_staff
  FOR SELECT USING (seller_id = app.staff_seller_id());
-- Only an owner may change who works for the house.
CREATE POLICY seller_owner_manage_staff ON seller_staff
  FOR ALL USING (seller_id = app.staff_seller_id() AND app.is_seller_owner())
  WITH CHECK (seller_id = app.staff_seller_id() AND app.is_seller_owner());

CREATE POLICY seller_manage_own_brands ON brands
  FOR ALL USING (seller_id = app.staff_seller_id())
  WITH CHECK (seller_id = app.staff_seller_id());

CREATE POLICY seller_manage_own_products ON products
  FOR ALL USING (seller_id = app.staff_seller_id())
  WITH CHECK (seller_id = app.staff_seller_id());

CREATE POLICY seller_manage_own_media ON product_media
  FOR ALL USING (EXISTS (
    SELECT 1 FROM products p WHERE p.id = product_media.product_id AND p.seller_id = app.staff_seller_id()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM products p WHERE p.id = product_media.product_id AND p.seller_id = app.staff_seller_id()));

CREATE POLICY seller_read_own_revisions ON product_revisions
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM products p WHERE p.id = product_revisions.product_id AND p.seller_id = app.staff_seller_id()));
CREATE POLICY seller_insert_own_revisions ON product_revisions
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM products p WHERE p.id = product_revisions.product_id AND p.seller_id = app.staff_seller_id()));

-- The core isolation rule: a house sees its own SUB-orders. Never the parent
-- order, which would expose what the customer bought from other houses.
CREATE POLICY seller_read_own_sub_orders ON sub_orders
  FOR SELECT USING (seller_id = app.staff_seller_id());
CREATE POLICY seller_update_own_sub_orders ON sub_orders
  FOR UPDATE USING (seller_id = app.staff_seller_id())
  WITH CHECK (seller_id = app.staff_seller_id());

CREATE POLICY seller_read_own_transitions ON sub_order_transitions
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM sub_orders s WHERE s.id = sub_order_transitions.sub_order_id
      AND s.seller_id = app.staff_seller_id()));
CREATE POLICY seller_insert_own_transitions ON sub_order_transitions
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM sub_orders s WHERE s.id = sub_order_transitions.sub_order_id
      AND s.seller_id = app.staff_seller_id()));

CREATE POLICY seller_read_own_line_items ON order_line_items
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM sub_orders s WHERE s.id = order_line_items.sub_order_id
      AND s.seller_id = app.staff_seller_id()));

CREATE POLICY seller_manage_own_shipments ON shipments
  FOR ALL USING (EXISTS (
    SELECT 1 FROM sub_orders s WHERE s.id = shipments.sub_order_id AND s.seller_id = app.staff_seller_id()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM sub_orders s WHERE s.id = shipments.sub_order_id AND s.seller_id = app.staff_seller_id()));

CREATE POLICY seller_read_own_returns ON returns
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM sub_orders s WHERE s.id = returns.sub_order_id AND s.seller_id = app.staff_seller_id()));

-- Money is owner-only. Doc 04 §1: staff process assigned tasks with LIMITED permissions.
CREATE POLICY seller_owner_read_payouts ON payouts
  FOR SELECT USING (seller_id = app.staff_seller_id() AND app.is_seller_owner());
CREATE POLICY seller_owner_read_payout_lines ON payout_lines
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM payouts p WHERE p.id = payout_lines.payout_id
      AND p.seller_id = app.staff_seller_id() AND app.is_seller_owner()));
CREATE POLICY seller_owner_read_adjustments ON adjustments
  FOR SELECT USING (seller_id = app.staff_seller_id() AND app.is_seller_owner());

-- A house reads the rate card it is charged under, and cannot write it.
CREATE POLICY seller_read_rule_sets ON commission_rule_sets FOR SELECT USING (true);
CREATE POLICY seller_read_own_overrides ON commission_overrides
  FOR SELECT USING (seller_id = app.staff_seller_id());

CREATE POLICY seller_read_own_tickets ON support_tickets
  FOR SELECT USING (seller_id = app.staff_seller_id());


-- -----------------------------------------------------------------------------
-- Customers — one account, one support route, one tracking surface
-- -----------------------------------------------------------------------------
CREATE POLICY customer_read_self ON customers
  FOR SELECT USING (id = app.customer_id());
CREATE POLICY customer_update_self ON customers
  FOR UPDATE USING (id = app.customer_id()) WITH CHECK (id = app.customer_id());

CREATE POLICY customer_manage_own_addresses ON customer_addresses
  FOR ALL USING (customer_id = app.customer_id())
  WITH CHECK (customer_id = app.customer_id());

CREATE POLICY customer_read_own_orders ON orders
  FOR SELECT USING (customer_id = app.customer_id());

CREATE POLICY customer_read_own_sub_orders ON sub_orders
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM orders o WHERE o.id = sub_orders.order_id AND o.customer_id = app.customer_id()));

CREATE POLICY customer_read_own_line_items ON order_line_items
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM sub_orders s JOIN orders o ON o.id = s.order_id
    WHERE s.id = order_line_items.sub_order_id AND o.customer_id = app.customer_id()));

CREATE POLICY customer_read_own_shipments ON shipments
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM sub_orders s JOIN orders o ON o.id = s.order_id
    WHERE s.id = shipments.sub_order_id AND o.customer_id = app.customer_id()));

CREATE POLICY customer_read_own_shipment_events ON shipment_events
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM shipments sh JOIN sub_orders s ON s.id = sh.sub_order_id
    JOIN orders o ON o.id = s.order_id
    WHERE sh.id = shipment_events.shipment_id AND o.customer_id = app.customer_id()));

CREATE POLICY customer_manage_own_returns ON returns
  FOR ALL USING (EXISTS (
    SELECT 1 FROM sub_orders s JOIN orders o ON o.id = s.order_id
    WHERE s.id = returns.sub_order_id AND o.customer_id = app.customer_id()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM sub_orders s JOIN orders o ON o.id = s.order_id
    WHERE s.id = returns.sub_order_id AND o.customer_id = app.customer_id()));

-- Writing a review: own purchase only. The delivered-only gate is 0001's trigger.
CREATE POLICY customer_write_own_reviews ON reviews
  FOR INSERT WITH CHECK (customer_id = app.customer_id());
CREATE POLICY customer_edit_own_reviews ON reviews
  FOR UPDATE USING (customer_id = app.customer_id())
  WITH CHECK (customer_id = app.customer_id());

CREATE POLICY customer_read_own_consents ON consent_records
  FOR SELECT USING (customer_id = app.customer_id());
CREATE POLICY customer_write_own_consents ON consent_records
  FOR INSERT WITH CHECK (customer_id = app.customer_id());

CREATE POLICY customer_read_own_tickets ON support_tickets
  FOR SELECT USING (customer_id = app.customer_id());


-- -----------------------------------------------------------------------------
-- Deliberate absences
--
-- These are load-bearing. A missing policy is a denial.
--
--  * No seller policy on `orders`. A house must never see the parent order —
--    that would expose what the customer bought from competing houses.
--  * No DELETE policy on `reviews` for anyone but platform. Doc 04 §3 and
--    doc 06 §10: "Brands cannot delete or privately suppress negative reviews."
--  * No seller or customer policy on `audit_log`. Platform only.
--  * No seller policy on `attribution_touches`. A house sees the resolved source
--    on its own sub-order; it does not get the customer's browsing trail.
--  * No seller policy on `customers`. A house receives the delivery details it
--    needs on the sub-order, not the customer record (doc 03 §8).
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- Application role
--
-- RLS never binds a SUPERUSER, whatever the policies say — and it does not bind
-- BYPASSRLS roles either. So the application connects as an ordinary role that
-- holds table privileges and nothing more. In Supabase this is `authenticated` /
-- `anon`; here it is app_user, and the tests connect through it so the policies
-- are genuinely exercised rather than silently skipped.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT USAGE ON SCHEMA app    TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
