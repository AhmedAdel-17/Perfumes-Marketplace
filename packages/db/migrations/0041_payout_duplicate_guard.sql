-- Defense in depth for the existing payout statement, not a second ledger.
-- Pattern: serialized selection in the adapter plus relational uniqueness.
-- Existing duplicates require operator review; never rewrite financial history.
-- rollback: keep this guard when rolling back the app; removing it permits
-- repeated settlement. The future ADR-03 ledger requires its own migration.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM payout_lines GROUP BY sub_order_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate payout lines require manual financial review; no history changed';
  END IF;
END $$;
CREATE UNIQUE INDEX payout_lines_sub_order_once_key ON payout_lines(sub_order_id);
