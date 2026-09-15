-- =============================================================================
-- 0020 — The dispatch clock that was never started
--
-- WHAT THIS FIXES. Every house has a dispatch SLA (`sellers.dispatch_sla_hours`,
-- default 48) and every sub-order has had a `dispatch_due_at` column since the
-- first migration. Nothing ever connected them. Placing an order received the
-- house's dispatch hours and discarded them; confirming an order stamped
-- `confirmed_at` and left `dispatch_due_at` NULL. Across every order this
-- system has taken, the column was never written.
--
-- So half of "seller SLA" did not exist. A house was never shown how long it
-- had to ship a confirmed order — its countdown covered confirmation only — and
-- doc 04 §8 gate 8 ("the owner can see seller SLA") could only ever have been
-- half-answered. Nothing failed: a NULL deadline is simply a deadline nobody
-- can miss, which is the quietest way for a promise to stop being kept.
--
-- THE SHAPE OF THE FIX follows the rule the commission rate and the delivery
-- arrangement already obey: the house's terms are SNAPSHOTTED onto the
-- sub-order when it is placed. A house that shortens or lengthens its dispatch
-- window next week must not rewrite what it promised on the orders it already
-- accepted. The clock starts at confirmation — a house cannot be late shipping
-- an order it has not yet agreed to — and ends `dispatch_sla_hours` later. That
-- arithmetic lives in the domain (`SubOrderLifecycle.dispatchDueAt`); this
-- migration guarantees the inputs and the shape.
-- =============================================================================

ALTER TABLE sub_orders ADD COLUMN dispatch_sla_hours integer;

-- Existing sub-orders take their house's CURRENT setting. It is the best value
-- that exists — the setting at the time of placement was never recorded — and
-- no house has changed its SLA since launch, so for every row today it is also
-- the true one. Stated here so nobody later mistakes it for a snapshot.
UPDATE sub_orders s
   SET dispatch_sla_hours = se.dispatch_sla_hours
  FROM sellers se
 WHERE se.id = s.seller_id;


-- -----------------------------------------------------------------------------
-- The database takes the snapshot when a writer does not
--
-- A trigger rather than a default. A DEFAULT of 48 would silently stamp every
-- house with the platform's default whether or not that is its term, and the
-- one thing a snapshot must never be is a guess. Copying from the house row
-- means every writer — the checkout adapter, the seeder, a test fixture, a
-- future import script — gets the house's actual term without having to know
-- this column exists, and the adapter's explicit value is kept when it sends
-- one.
--
-- SECURITY DEFINER with a pinned search_path, because the insert may run as the
-- `checkout` service role and this reads one integer off `sellers`; the
-- function exposes nothing to its caller but that integer landing on the row
-- being written.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION snapshot_dispatch_sla()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.dispatch_sla_hours IS NULL THEN
    SELECT dispatch_sla_hours INTO NEW.dispatch_sla_hours
      FROM sellers WHERE id = NEW.seller_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER sub_orders_snapshot_dispatch_sla
  BEFORE INSERT ON sub_orders
  FOR EACH ROW EXECUTE FUNCTION snapshot_dispatch_sla();

-- NOT NULL is checked after BEFORE triggers run, so the trigger above fills the
-- value first and this refuses only a sub-order whose house does not exist.
ALTER TABLE sub_orders ALTER COLUMN dispatch_sla_hours SET NOT NULL;

ALTER TABLE sub_orders
  ADD CONSTRAINT sub_orders_dispatch_sla_positive CHECK (dispatch_sla_hours > 0);


-- -----------------------------------------------------------------------------
-- Orders confirmed before today get the clock they should have had
--
-- Backfilled so the owner's SLA figures do not begin with a hole: an order
-- confirmed last week and still unshipped IS late, and a NULL deadline would
-- report it as on time.
-- -----------------------------------------------------------------------------
UPDATE sub_orders
   SET dispatch_due_at = confirmed_at + make_interval(hours => dispatch_sla_hours)
 WHERE confirmed_at IS NOT NULL
   AND dispatch_due_at IS NULL;

-- A dispatch deadline exists only once the order is confirmed, and falls after
-- the confirmation. The domain computes it; this makes a hand-written one that
-- predates its own confirmation impossible to store.
ALTER TABLE sub_orders
  ADD CONSTRAINT sub_orders_dispatch_due_after_confirm
  CHECK (dispatch_due_at IS NULL OR (confirmed_at IS NOT NULL AND dispatch_due_at > confirmed_at));
