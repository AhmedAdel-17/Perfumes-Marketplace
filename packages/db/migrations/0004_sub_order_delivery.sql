-- =============================================================================
-- 0004 — Delivery details on the sub-order
--
-- WHAT THIS FIXES. Migration 0002 records, under "Deliberate absences":
--
--     No seller policy on `orders`. A house must never see the parent order —
--     that would expose what the customer bought from competing houses.
--     ...
--     A house receives the delivery details it needs ON THE SUB-ORDER.
--
-- The first half was enforced. The second half was never built: `sub_orders`
-- had no recipient and no address, and neither did `shipments`. So a house
-- could see an order it had to pack and had no way to learn where to send it.
-- The security model was correct and the schema had not caught up with it.
--
-- WHY DENORMALISE RATHER THAN OPEN UP `orders`.
--
--  * RLS is ROW-level. Any seller policy on `orders` exposes the whole row —
--    the basket total across every house, the order-level attribution source.
--    That is the exact leak 0002 forbids, reintroduced through a side door.
--  * Column-level restriction would need a SECURITY DEFINER view, which is more
--    machinery guarding the same rule, and one more thing to get wrong.
--  * The copy is also correct on its own terms. This is the address the parcel
--    was SHIPPED TO, and it must not change when the customer later edits their
--    saved address — the same reason price and commission are snapshotted onto
--    the line item rather than read live.
--
-- Backfilled from `orders` before the NOT NULL constraints land, so the
-- migration is safe on a database that already holds orders.
-- =============================================================================

ALTER TABLE sub_orders
  ADD COLUMN recipient_name  text,
  ADD COLUMN recipient_phone text,
  ADD COLUMN governorate     governorate,
  ADD COLUMN city            text,
  ADD COLUMN area            text,
  ADD COLUMN street          text,
  ADD COLUMN building        text,
  ADD COLUMN floor           text,
  ADD COLUMN apartment       text,
  -- Optional and load-bearing: doc 03 §4 makes failed delivery the largest
  -- single cost line, and a landmark is what lets a courier arrive without
  -- phoning. It has to reach the house that prints the label.
  ADD COLUMN landmark        text;

UPDATE sub_orders s SET
  recipient_name  = o.contact_name,
  recipient_phone = o.contact_phone,
  governorate     = o.governorate,
  city            = o.city,
  area            = o.area,
  street          = o.street,
  building        = o.building,
  floor           = o.floor,
  apartment       = o.apartment,
  landmark        = o.landmark
FROM orders o
WHERE o.id = s.order_id;

ALTER TABLE sub_orders
  ALTER COLUMN recipient_name  SET NOT NULL,
  ALTER COLUMN recipient_phone SET NOT NULL,
  ALTER COLUMN governorate     SET NOT NULL,
  ALTER COLUMN city            SET NOT NULL,
  ALTER COLUMN area            SET NOT NULL,
  ALTER COLUMN street          SET NOT NULL,
  ALTER COLUMN building        SET NOT NULL;

-- The courier needs a reachable number, and the house needs it to be one it can
-- print. Mirrors the same rule already enforced on `orders` and `customers`.
ALTER TABLE sub_orders
  ADD CONSTRAINT sub_orders_recipient_phone_shape
  CHECK (recipient_phone ~ '^(\+20|0)1[0125][0-9]{8}$');
