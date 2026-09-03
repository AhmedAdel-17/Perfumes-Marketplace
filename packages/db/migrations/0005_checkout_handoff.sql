-- =============================================================================
-- 0005 — Handing the order to the house
--
-- WHAT THIS FIXES. An order was written in state `placed` and nothing ever moved
-- it to `awaiting_seller`. The state machine only allows a house to confirm FROM
-- `awaiting_seller`, so every order arrived in the seller queue in a state where
-- the confirm button could not legally do anything. The house saw the order and
-- could not accept it.
--
-- Found by signing in as a house and pressing the button, which is the only way
-- this class of gap gets found: every layer was individually correct.
--
-- WHY THE TWO STATES ARE NOT REDUNDANT. `placed` means the marketplace holds the
-- order. `awaiting_seller` means the HOUSE HAS BEEN TOLD and the confirmation SLA
-- is running. Collapsing them would start a countdown against a house that had
-- not been notified yet, and doc 06 §7 allocates the cost of a missed SLA to the
-- house — so the distinction is the difference between a fair charge and an
-- unfair one. When notifications exist, they dispatch at exactly this transition.
--
-- The handoff happens inside the placement transaction: if it fails, the order
-- does not exist either. That means the `checkout` service role needs to move a
-- sub-order it just created, and to append the transition record.
-- =============================================================================

CREATE POLICY checkout_handoff_sub_orders ON sub_orders
  FOR UPDATE USING (app.is_checkout()) WITH CHECK (app.is_checkout());

-- The audit trail for that move. `sub_order_transitions` is append-only —
-- migration 0001 enforces it with a statement-level trigger — so INSERT is the
-- only right this grants and the only one it could grant.
CREATE POLICY checkout_record_transition ON sub_order_transitions
  FOR INSERT WITH CHECK (app.is_checkout());

CREATE POLICY checkout_read_transition ON sub_order_transitions
  FOR SELECT USING (app.is_checkout());
