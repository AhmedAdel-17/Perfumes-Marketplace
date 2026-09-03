-- =============================================================================
-- 0006 — The customer can see their own parcel
--
-- Order tracking runs under the `checkout` service role (0003), because a guest
-- has no session and the router requires reference AND phone before it will
-- look anything up. That role could read the order and the sub-orders but not
-- the shipment, so a dispatched order showed "in transit" and no way to find
-- the parcel — the one piece of information the customer actually wants at
-- that moment.
--
-- `customer_read_own_shipments` in 0002 covers the SIGNED-IN case and is keyed
-- on `app.customer_id()`, which a guest does not have. Accounts do not exist
-- yet; guests are the only customers there are.
--
-- SELECT only. The customer reads where their parcel is; they do not write
-- anything about it.
-- =============================================================================

CREATE POLICY checkout_read_shipments ON shipments
  FOR SELECT USING (app.is_checkout());
