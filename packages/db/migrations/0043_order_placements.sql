-- =============================================================================
-- 0043 — One order per checkout, however many times the button is pressed
-- (16 Nov 2026; DEBT_REGISTER #12, docs/LAUNCH_TASKS.md B7)
--
-- A retried checkout created a second order. On a phone on mobile data the
-- retry is ordinary: the request reaches the server, the reply is lost, the
-- customer presses again — and a house receives two orders for one bottle.
--
-- The browser now sends a key, fixed for one checkout, with every attempt.
-- The first attempt records the key beside the order it created, in the SAME
-- transaction, together with the reply the customer was shown. A later attempt
-- with the same key is answered from this row, and no second order is written.
-- Two attempts racing each other meet at the primary key: the loser's whole
-- transaction (its order included) rolls back, and it is answered from the
-- winner's row.
--
-- The reply is stored rather than recomputed because it holds the arrival
-- window quoted at placement, which nothing else records — and the replay must
-- say exactly what the first answer said.
--
-- rollback: additive. Dropping the table restores the old behaviour (a retry
-- makes a second order); no other table refers to it.
-- =============================================================================

CREATE TABLE order_placements (
  idempotency_key uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  reply jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE order_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_placements FORCE  ROW LEVEL SECURITY;

-- Operators may read it, to answer "did this customer order twice?".
CREATE POLICY platform_read_placements ON order_placements
  FOR SELECT USING (app.is_platform());

-- The placement transaction writes its own row and reads keys back. Nothing
-- may UPDATE or DELETE a placement: a key that could be reused would be a key
-- that no longer proves anything.
CREATE POLICY checkout_insert_placements ON order_placements
  FOR INSERT WITH CHECK (app.is_checkout());

CREATE POLICY checkout_select_placements ON order_placements
  FOR SELECT USING (app.is_checkout());
