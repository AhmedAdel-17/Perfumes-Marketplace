-- =============================================================================
-- 0019 — A house can act on its own returns
--
-- WHAT THIS FIXES. Migration 0002 gave sellers `seller_read_own_returns` and
-- nothing else. So a house could SEE a return request and could not answer it:
-- every decision button on the returns queue matched zero rows, and the router
-- reported "the state changed, refresh the page" — which is what an
-- unconditional-write guard says when the real problem is that the write was
-- never permitted at all.
--
-- That is the worst shape a permissions bug takes. It does not raise, it does
-- not log, and the message it produces sends the person looking in exactly the
-- wrong direction. Caught by an API test walking a return through its states as
-- a house, not by reading 0002.
--
-- WHY THE POLICY IS NARROWER THAN THE TABLE. A house may move a return through
-- the physical part of its life — agree to take the bottle back, record that it
-- is on its way, record that it arrived. It may not touch `refund_piastres` or
-- `cost_bearer`: money is the platform's to move, and a house that could write
-- its own refund could close a case without paying anybody.
--
-- Postgres has no column-level RLS, so the WITH CHECK enforces that by
-- comparing the new row against the old one. A house's UPDATE that changed a
-- money column is refused by the database, not merely omitted by the router.
-- =============================================================================

CREATE POLICY seller_update_own_returns ON returns
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM sub_orders s
    WHERE s.id = returns.sub_order_id AND s.seller_id = app.staff_seller_id()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM sub_orders s
    WHERE s.id = returns.sub_order_id AND s.seller_id = app.staff_seller_id()));


-- -----------------------------------------------------------------------------
-- The money columns are the platform's
--
-- A trigger rather than a policy, because RLS binds ROWS and this is a rule
-- about COLUMNS. It fires for every actor and singles out the seller, so the
-- platform keeps its blanket policy and a house keeps its queue.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_return_money_is_platform_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF app.actor_role() = 'seller' THEN
    IF NEW.refund_piastres IS DISTINCT FROM OLD.refund_piastres THEN
      RAISE EXCEPTION 'A house cannot set the refund on its own return'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.cost_bearer IS DISTINCT FROM OLD.cost_bearer THEN
      RAISE EXCEPTION 'A house cannot reallocate who bears the cost of a return'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER returns_money_is_platform_only
  BEFORE UPDATE ON returns
  FOR EACH ROW EXECUTE FUNCTION enforce_return_money_is_platform_only();
