-- Refund facts, not a payment gateway or a double-entry settlement ledger.
-- Existing refund amounts are imported unchanged; new facts are append-only.
-- Safe customer-total ceilings preserve the existing undifferentiated amount:
-- no shipping allocation, fee reversal or provider execution is inferred.
-- Rollback: retain additive money guards and historical records; never drop facts.
CREATE TABLE return_refund_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL UNIQUE REFERENCES returns(id) ON DELETE RESTRICT,
  sub_order_id uuid NOT NULL REFERENCES sub_orders(id) ON DELETE RESTRICT,
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
  line_item_id uuid REFERENCES order_line_items(id) ON DELETE RESTRICT,
  amount_piastres integer NOT NULL CHECK(amount_piastres>=0),
  source text NOT NULL CHECK(source IN ('historical_import','recorded')),
  recorded_by uuid,
  observed_decision_at timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX return_refund_records_sub_order_idx ON return_refund_records(sub_order_id);
CREATE INDEX return_refund_records_seller_idx ON return_refund_records(seller_id,recorded_at);

-- Preserve every recorded amount; a malformed negative legacy fact stops review
-- rather than silently correcting history. 'observed_decision_at' is the source
-- row timestamp and is deliberately not labelled as payment execution time.
INSERT INTO return_refund_records(return_id,sub_order_id,seller_id,line_item_id,
  amount_piastres,source,recorded_by,observed_decision_at)
SELECT r.id,r.sub_order_id,s.seller_id,r.line_item_id,r.refund_piastres,
  'historical_import',r.decided_by,r.decided_at
FROM returns r JOIN sub_orders s ON s.id=r.sub_order_id
WHERE r.refund_piastres IS NOT NULL;

ALTER TABLE return_refund_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_refund_records FORCE ROW LEVEL SECURITY;
CREATE POLICY refund_records_platform_read ON return_refund_records FOR SELECT USING(app.is_platform());
CREATE POLICY refund_records_owner_read ON return_refund_records FOR SELECT
  USING(seller_id=app.staff_seller_id() AND app.is_seller_owner());
CREATE POLICY refund_records_platform_insert ON return_refund_records FOR INSERT
  WITH CHECK(app.is_platform() AND source='recorded' AND EXISTS(
    SELECT 1 FROM returns r JOIN sub_orders s ON s.id=r.sub_order_id
    WHERE r.id=return_id AND r.sub_order_id=return_refund_records.sub_order_id
      AND s.seller_id=return_refund_records.seller_id
      AND r.line_item_id IS NOT DISTINCT FROM return_refund_records.line_item_id
      AND r.refund_piastres=amount_piastres AND r.status IN ('refunded','closed')
      AND r.decided_by IS NOT DISTINCT FROM recorded_by
      AND r.decided_at IS NOT DISTINCT FROM observed_decision_at));
GRANT SELECT,INSERT ON return_refund_records TO app_user;
REVOKE UPDATE,DELETE ON return_refund_records FROM app_user;

CREATE FUNCTION app.reject_refund_fact_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'Recorded refund facts are immutable' USING ERRCODE='check_violation'; END $$;
CREATE TRIGGER refund_facts_immutable BEFORE UPDATE OR DELETE ON return_refund_records
  FOR EACH ROW EXECUTE FUNCTION app.reject_refund_fact_mutation();

CREATE FUNCTION app.guard_return_claim_scope() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF NEW.status<>'requested' OR NEW.refund_piastres IS NOT NULL THEN
    RAISE EXCEPTION 'A new return starts requested, without a recorded refund' USING ERRCODE='check_violation';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('return-scope:'||NEW.sub_order_id::text,0));
  IF EXISTS(SELECT 1 FROM public.returns r WHERE r.sub_order_id=NEW.sub_order_id
    AND (NEW.line_item_id IS NULL OR r.line_item_id IS NULL OR r.line_item_id=NEW.line_item_id)) THEN
    RAISE EXCEPTION 'A return already covers this purchase scope' USING ERRCODE='unique_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER return_claim_scope BEFORE INSERT ON returns
  FOR EACH ROW EXECUTE FUNCTION app.guard_return_claim_scope();

CREATE FUNCTION app.guard_recorded_refund() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ceiling bigint; existing bigint; line_ceiling bigint; parent_order uuid; order_ceiling bigint; order_refunded bigint;
BEGIN
  IF NEW.sub_order_id IS DISTINCT FROM OLD.sub_order_id OR NEW.line_item_id IS DISTINCT FROM OLD.line_item_id THEN
    RAISE EXCEPTION 'Return purchase scope is immutable' USING ERRCODE='check_violation';
  END IF;
  IF OLD.refund_piastres IS NOT NULL AND NEW.refund_piastres IS DISTINCT FROM OLD.refund_piastres THEN
    RAISE EXCEPTION 'A recorded refund amount cannot be replaced' USING ERRCODE='check_violation';
  END IF;
  IF NEW.status='refunded' AND NEW.refund_piastres IS NULL THEN
    RAISE EXCEPTION 'A refund amount is required' USING ERRCODE='check_violation';
  END IF;
  IF OLD.refund_piastres IS NULL AND NEW.refund_piastres IS NOT NULL THEN
    IF NOT app.is_platform() OR OLD.status<>'received' OR NEW.status<>'refunded' OR NEW.refund_piastres<0 THEN
      RAISE EXCEPTION 'Only the platform records a received return refund' USING ERRCODE='check_violation';
    END IF;
    -- The parent total already includes its order-level discount. Lock it
    -- before checking any sibling parcels; no discount allocation is invented.
    SELECT order_id INTO parent_order FROM public.sub_orders WHERE id=NEW.sub_order_id;
    IF parent_order IS NULL THEN
      RAISE EXCEPTION 'Refund purchase not found' USING ERRCODE='check_violation';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('return-order-refund:'||parent_order::text,0));
    SELECT total_piastres::bigint INTO order_ceiling FROM public.orders WHERE id=parent_order;
    SELECT coalesce(sum(f.amount_piastres::bigint),0) INTO order_refunded
    FROM public.return_refund_records f JOIN public.sub_orders s ON s.id=f.sub_order_id
    WHERE s.order_id=parent_order;
    IF order_ceiling IS NULL OR order_refunded+NEW.refund_piastres>order_ceiling THEN
      RAISE EXCEPTION 'Cumulative refunds exceed the original discounted order total' USING ERRCODE='check_violation';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('return-refund:'||NEW.sub_order_id::text,0));
    SELECT merchandise_piastres::bigint+shipping_piastres INTO ceiling FROM public.sub_orders WHERE id=NEW.sub_order_id;
    SELECT coalesce(sum(amount_piastres::bigint),0) INTO existing FROM public.return_refund_records WHERE sub_order_id=NEW.sub_order_id;
    IF NEW.line_item_id IS NOT NULL THEN
      SELECT li.line_piastres::bigint+s.shipping_piastres INTO line_ceiling
      FROM public.order_line_items li JOIN public.sub_orders s ON s.id=li.sub_order_id
      WHERE li.id=NEW.line_item_id AND li.sub_order_id=NEW.sub_order_id;
      IF line_ceiling IS NULL OR NEW.refund_piastres>line_ceiling THEN
        RAISE EXCEPTION 'Refund exceeds purchased line and parcel shipping ceiling' USING ERRCODE='check_violation';
      END IF;
    END IF;
    IF ceiling IS NULL OR existing+NEW.refund_piastres>ceiling THEN
      RAISE EXCEPTION 'Cumulative refunds exceed the original parcel customer total' USING ERRCODE='check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER return_refund_guard BEFORE UPDATE ON returns
  FOR EACH ROW EXECUTE FUNCTION app.guard_recorded_refund();

CREATE FUNCTION app.capture_recorded_refund() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF OLD.refund_piastres IS NULL AND NEW.refund_piastres IS NOT NULL THEN
    INSERT INTO public.return_refund_records(return_id,sub_order_id,seller_id,line_item_id,
      amount_piastres,source,recorded_by,observed_decision_at)
    SELECT NEW.id,NEW.sub_order_id,s.seller_id,NEW.line_item_id,NEW.refund_piastres,
      'recorded',NEW.decided_by,NEW.decided_at FROM public.sub_orders s WHERE s.id=NEW.sub_order_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER return_refund_capture AFTER UPDATE ON returns
  FOR EACH ROW EXECUTE FUNCTION app.capture_recorded_refund();
