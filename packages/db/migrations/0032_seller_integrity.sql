-- DB-SAFE-01: tenant-consistent listings and seller-denied COD evidence.
-- Pattern: composite referential integrity + field-authority guard, retaining
-- existing Repository/Unit of Work and RLS boundaries. No commercial terms change.
-- Apply with the reviewed migration identity, never an RLS-limited seller role.
-- No data rewrite: legacy ownership mismatches stop the migration for review.
-- rollback: retain these additive guards when rolling the application back.
-- Removing products_brand_seller_fk / brands_id_seller_key or the shipment
-- trigger/function would reopen the audited holes and requires security review;
-- no data needs to be restored or repriced. Historical migrations stay intact.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM products p JOIN brands b ON b.id = p.brand_id
    WHERE p.seller_id <> b.seller_id
  ) THEN
    RAISE EXCEPTION 'DB-SAFE-01: existing listing/brand ownership mismatches require manual review; no rows changed'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX brands_id_seller_key ON brands (id, seller_id);
--> statement-breakpoint
ALTER TABLE products ADD CONSTRAINT products_brand_seller_fk
  FOREIGN KEY (brand_id, seller_id) REFERENCES brands (id, seller_id)
  ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE products VALIDATE CONSTRAINT products_brand_seller_fk;
--> statement-breakpoint

-- RLS scopes the row; this invoker trigger scopes which facts a seller may
-- write. Platform records cash/delivery evidence; the house supplies tracking.
-- Do not use SECURITY DEFINER: the guard requires no privileged data access.
CREATE FUNCTION app.guard_seller_shipment_evidence() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF app.actor_role() <> 'seller' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'A house cannot delete shipment evidence'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.cod_collected_piastres IS NOT NULL
       OR NEW.cod_remitted_at IS NOT NULL
       OR NEW.proof_of_delivery_ref IS NOT NULL
       OR NEW.delivered_at IS NOT NULL THEN
      RAISE EXCEPTION 'COD collection, remittance and delivery evidence are platform-controlled'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    IF NEW.cod_collected_piastres IS DISTINCT FROM OLD.cod_collected_piastres
       OR NEW.cod_remitted_at IS DISTINCT FROM OLD.cod_remitted_at
       OR NEW.proof_of_delivery_ref IS DISTINCT FROM OLD.proof_of_delivery_ref
       OR NEW.delivered_at IS DISTINCT FROM OLD.delivered_at
       OR NEW.cod_amount_piastres IS DISTINCT FROM OLD.cod_amount_piastres
       OR NEW.sub_order_id IS DISTINCT FROM OLD.sub_order_id THEN
      RAISE EXCEPTION 'A house cannot rewrite shipment ownership, COD amounts or delivery evidence'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER shipments_seller_evidence_guard
  BEFORE INSERT OR UPDATE OR DELETE ON shipments
  FOR EACH ROW EXECUTE FUNCTION app.guard_seller_shipment_evidence();
