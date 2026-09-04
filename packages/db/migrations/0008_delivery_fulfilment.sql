-- =============================================================================
-- 0008 — Who fulfils the delivery, and therefore who receives the fee
--
-- Settles the open decision recorded in OPEN_DECISIONS.md on 3 September 2026.
--
-- THE PRINCIPLE. Whoever bears the delivery cost receives the delivery revenue.
-- Delivery must be neither a hidden margin nor a hidden loss for either side.
-- This is how every merchant-fulfilled marketplace works — Amazon FBM, Etsy,
-- Noon, Jumia — and the reason is not convention: the moment the fee stops
-- following the cost, one party is quietly subsidising the other and neither
-- can see it in their own numbers.
--
-- We had it wrong in BOTH directions at once. The domain deducted shipping from
-- the house's payout while the house was also paying the courier itself, and
-- the marketplace kept the fee the customer paid. The house was charged twice
-- for a delivery it performed.
--
-- WHY THIS IS A COLUMN AND NOT A CONSTANT. Today every house ships its own
-- parcel (`manualCourier`). When Bosta is integrated the marketplace will book
-- centrally for some houses and not others, and both arrangements will run at
-- once. A hardcoded rule would make that migration a schema change plus a
-- renegotiation with every seller; a per-house setting makes it a row update.
--
-- It is SNAPSHOTTED onto the sub-order at placement, for the same reason the
-- commission rate is: changing the arrangement tomorrow must not silently
-- rewrite what a house was owed for an order it shipped last month.
--
-- Note also what is deliberately NOT changed: commission is charged on
-- merchandise, never on the delivery fee. A platform whose revenue rises with
-- the cost of delivery has an incentive pointing the wrong way.
-- =============================================================================

CREATE TYPE delivery_fulfilled_by AS ENUM ('seller', 'platform');

ALTER TABLE sellers
  ADD COLUMN delivery_fulfilled_by delivery_fulfilled_by NOT NULL DEFAULT 'seller';

COMMENT ON COLUMN sellers.delivery_fulfilled_by IS
  'seller = the house books and pays the courier, and is reimbursed the delivery fee the customer paid. platform = the marketplace books and pays, and keeps the fee.';

ALTER TABLE sub_orders
  ADD COLUMN delivery_fulfilled_by delivery_fulfilled_by;

-- Existing rows: every order to date was shipped by its house.
UPDATE sub_orders SET delivery_fulfilled_by = 'seller' WHERE delivery_fulfilled_by IS NULL;

ALTER TABLE sub_orders
  ALTER COLUMN delivery_fulfilled_by SET NOT NULL;

-- -----------------------------------------------------------------------------
-- The payout line formula
--
-- `payout_lines.shipping_piastres` now means "delivery fee REIMBURSED to this
-- house" — the fee the customer paid, passed through when the house shipped,
-- and zero when the marketplace did. Defining it that way keeps one formula for
-- both arrangements instead of a conditional, and a conditional in a CHECK
-- constraint is a rule with a branch nobody tests.
--
--     net = gross − commission + shipping
--
-- The previous constraint was `net = gross − commission`, which was correct
-- only for platform-fulfilled delivery — an arrangement that does not yet exist
-- anywhere in the system.
-- -----------------------------------------------------------------------------
ALTER TABLE payout_lines
  DROP CONSTRAINT payout_lines_net_reconciles;

ALTER TABLE payout_lines
  ADD CONSTRAINT payout_lines_net_reconciles
    CHECK (net_piastres = gross_piastres - commission_piastres + shipping_piastres);
