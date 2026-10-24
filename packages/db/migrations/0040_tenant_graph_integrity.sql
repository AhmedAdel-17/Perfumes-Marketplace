-- F09/F16: preserve tenant-consistent order/statement graphs and bounded bps.
-- Pattern: relational FKs plus invoker invariant guards. Tenant ownership is
-- immutable; read-only checkout needs no additional product UPDATE policy.
-- Legacy inconsistencies stop before changes; repairs require separate review.
-- rollback: retain additive integrity guards on application rollback. Removing
-- them reopens cross-tenant links; no historical amounts are recalculated.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM order_line_items l JOIN products p ON p.id=l.product_id
    JOIN sub_orders s ON s.id=l.sub_order_id WHERE p.seller_id<>s.seller_id)
    OR EXISTS (SELECT 1 FROM payout_lines l JOIN payouts p ON p.id=l.payout_id
      JOIN sub_orders s ON s.id=l.sub_order_id WHERE p.seller_id<>s.seller_id)
    OR EXISTS (SELECT 1 FROM returns r JOIN order_line_items l ON l.id=r.line_item_id
      WHERE r.sub_order_id<>l.sub_order_id)
    OR EXISTS (SELECT 1 FROM reviews r JOIN order_line_items l ON l.id=r.line_item_id
      WHERE r.sub_order_id<>l.sub_order_id OR r.product_id<>l.product_id)
    OR EXISTS (SELECT 1 FROM commission_overrides WHERE bps NOT BETWEEN 0 AND 10000)
  THEN RAISE EXCEPTION 'Data integrity preflight failed; review inconsistent tenant links or basis points; no repair performed';
  END IF;
END $$;
CREATE INDEX order_line_items_product_idx ON order_line_items(product_id);
CREATE INDEX payout_lines_sub_order_idx ON payout_lines(sub_order_id);
CREATE UNIQUE INDEX order_line_items_id_sub_order_key ON order_line_items(id,sub_order_id);
CREATE UNIQUE INDEX order_line_items_review_identity_key ON order_line_items(id,sub_order_id,product_id);
ALTER TABLE returns ADD CONSTRAINT returns_line_sub_order_fk
  FOREIGN KEY(line_item_id,sub_order_id) REFERENCES order_line_items(id,sub_order_id) NOT VALID;
ALTER TABLE returns VALIDATE CONSTRAINT returns_line_sub_order_fk;
ALTER TABLE reviews ADD CONSTRAINT reviews_line_identity_fk
  FOREIGN KEY(line_item_id,sub_order_id,product_id)
  REFERENCES order_line_items(id,sub_order_id,product_id) NOT VALID;
ALTER TABLE reviews VALIDATE CONSTRAINT reviews_line_identity_fk;
ALTER TABLE commission_overrides ADD CONSTRAINT commission_overrides_bps_range
  CHECK (bps BETWEEN 0 AND 10000) NOT VALID;
ALTER TABLE commission_overrides VALIDATE CONSTRAINT commission_overrides_bps_range;

CREATE FUNCTION app.guard_line_tenant() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE parent_seller uuid; child_seller uuid;
BEGIN
  IF TG_TABLE_NAME='order_line_items' THEN
    SELECT seller_id INTO parent_seller FROM public.products WHERE id=NEW.product_id;
  ELSE
    SELECT seller_id INTO parent_seller FROM public.payouts WHERE id=NEW.payout_id;
  END IF;
  SELECT seller_id INTO child_seller FROM public.sub_orders WHERE id=NEW.sub_order_id;
  IF parent_seller IS NULL OR child_seller IS NULL OR parent_seller<>child_seller THEN
    RAISE EXCEPTION 'Line and parent must belong to the same seller'
      USING ERRCODE='foreign_key_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER order_lines_tenant_guard BEFORE INSERT OR UPDATE ON order_line_items
  FOR EACH ROW EXECUTE FUNCTION app.guard_line_tenant();
CREATE TRIGGER payout_lines_tenant_guard BEFORE INSERT OR UPDATE ON payout_lines
  FOR EACH ROW EXECUTE FUNCTION app.guard_line_tenant();

CREATE FUNCTION app.guard_linked_parent_tenant() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  -- Seller identity is part of a marketplace record's permanent identity.
  -- A transfer requires a separately reviewed workflow, never an ordinary UPDATE.
  -- This also closes the concurrent insert/reassignment race without granting
  -- checkout permission to lock/update products or bypassing tenant RLS.
  IF NEW.seller_id IS DISTINCT FROM OLD.seller_id THEN
    RAISE EXCEPTION 'Tenant ownership is immutable; use a separately reviewed transfer workflow'
      USING ERRCODE='foreign_key_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER products_linked_tenant_guard BEFORE UPDATE OF seller_id ON products
  FOR EACH ROW EXECUTE FUNCTION app.guard_linked_parent_tenant();
CREATE TRIGGER payouts_linked_tenant_guard BEFORE UPDATE OF seller_id ON payouts
  FOR EACH ROW EXECUTE FUNCTION app.guard_linked_parent_tenant();
CREATE TRIGGER sub_orders_linked_tenant_guard BEFORE UPDATE OF seller_id ON sub_orders
  FOR EACH ROW EXECUTE FUNCTION app.guard_linked_parent_tenant();
