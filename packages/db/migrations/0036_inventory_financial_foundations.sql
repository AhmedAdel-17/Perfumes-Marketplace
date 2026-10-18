-- Policy-neutral launch foundations: inventory truth, provider idempotency,
-- refund allocation, immutable postings, and global payout deduplication.
-- Existing product stock is preserved as the opening available balance.

CREATE TYPE inventory_reservation_status AS ENUM ('active','released','consumed','expired');
CREATE TYPE inventory_movement_reason AS ENUM (
  'opening_balance','seller_correction','reservation','release','sale',
  'return_inspected','damage','transfer_in','transfer_out'
);

CREATE TABLE inventory_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'seller' CHECK (kind IN ('seller','platform','third_party')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(seller_id,code), UNIQUE(id,seller_id)
);
CREATE UNIQUE INDEX products_id_seller_key ON products(id,seller_id);
CREATE TABLE inventory_balances (
  product_id uuid NOT NULL,
  location_id uuid NOT NULL,
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
  on_hand integer NOT NULL DEFAULT 0 CHECK(on_hand>=0),
  reserved integer NOT NULL DEFAULT 0 CHECK(reserved>=0 AND reserved<=on_hand),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(product_id,location_id),
  FOREIGN KEY(product_id,seller_id) REFERENCES products(id,seller_id) ON DELETE RESTRICT,
  FOREIGN KEY(location_id,seller_id) REFERENCES inventory_locations(id,seller_id) ON DELETE RESTRICT
);
CREATE TABLE inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key uuid NOT NULL UNIQUE,
  product_id uuid NOT NULL,
  location_id uuid NOT NULL,
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
  order_line_item_id uuid REFERENCES order_line_items(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK(quantity>0),
  status inventory_reservation_status NOT NULL DEFAULT 'active',
  expires_at timestamptz NOT NULL,
  released_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(product_id,location_id) REFERENCES inventory_balances(product_id,location_id) ON DELETE RESTRICT,
  FOREIGN KEY(product_id,seller_id) REFERENCES products(id,seller_id) ON DELETE RESTRICT,
  CHECK ((status='active' AND released_at IS NULL AND consumed_at IS NULL)
    OR (status IN ('released','expired') AND released_at IS NOT NULL AND consumed_at IS NULL)
    OR (status='consumed' AND consumed_at IS NOT NULL AND released_at IS NULL))
);
CREATE INDEX inventory_reservations_expiry_idx ON inventory_reservations(expires_at) WHERE status='active';
CREATE INDEX inventory_reservations_product_idx ON inventory_reservations(product_id,status);

CREATE TABLE inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL,
  location_id uuid NOT NULL,
  reservation_id uuid REFERENCES inventory_reservations(id) ON DELETE RESTRICT,
  reason inventory_movement_reason NOT NULL,
  delta_on_hand integer NOT NULL DEFAULT 0,
  delta_reserved integer NOT NULL DEFAULT 0,
  actor_id uuid,
  note text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(product_id,location_id) REFERENCES inventory_balances(product_id,location_id) ON DELETE RESTRICT,
  CHECK(delta_on_hand<>0 OR delta_reserved<>0)
);
CREATE INDEX inventory_movements_product_idx ON inventory_movements(product_id,occurred_at);

INSERT INTO inventory_locations(seller_id,code,name)
SELECT id,'default','Default inventory' FROM sellers;
INSERT INTO inventory_balances(product_id,location_id,seller_id,on_hand)
SELECT p.id,l.id,p.seller_id,p.stock FROM products p
JOIN inventory_locations l ON l.seller_id=p.seller_id AND l.code='default';
INSERT INTO inventory_movements(idempotency_key,seller_id,product_id,location_id,reason,delta_on_hand,note)
SELECT 'opening:'||p.id,p.seller_id,p.id,l.id,'opening_balance',p.stock,'Migration opening balance'
FROM products p JOIN inventory_locations l ON l.seller_id=p.seller_id AND l.code='default'
WHERE p.stock<>0;

CREATE FUNCTION app.sync_product_available_stock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE target uuid := COALESCE(NEW.product_id,OLD.product_id); available integer;
BEGIN
  -- A legacy products.stock edit already owns the product row and updates its
  -- balance inside that row trigger. Updating the same tuple again is invalid.
  IF pg_trigger_depth()>1 THEN RETURN COALESCE(NEW,OLD); END IF;
  SELECT COALESCE(sum(on_hand-reserved),0)::integer INTO available
  FROM public.inventory_balances WHERE product_id=target;
  UPDATE public.products SET stock=available WHERE id=target AND stock<>available;
  RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER inventory_balance_stock_sync AFTER INSERT OR UPDATE OR DELETE ON inventory_balances
FOR EACH ROW EXECUTE FUNCTION app.sync_product_available_stock();

CREATE FUNCTION app.seed_product_inventory() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE location uuid;
BEGIN
  INSERT INTO public.inventory_locations(seller_id,code,name) VALUES(NEW.seller_id,'default','Default inventory')
    ON CONFLICT(seller_id,code) DO UPDATE SET name=EXCLUDED.name RETURNING id INTO location;
  INSERT INTO public.inventory_balances(product_id,location_id,seller_id,on_hand)
    VALUES(NEW.id,location,NEW.seller_id,NEW.stock);
  IF NEW.stock<>0 THEN
    INSERT INTO public.inventory_movements(idempotency_key,seller_id,product_id,location_id,reason,delta_on_hand,actor_id,note)
    VALUES('opening:'||NEW.id,NEW.seller_id,NEW.id,location,'opening_balance',NEW.stock,app.actor_id(),'Initial product stock');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER products_seed_inventory AFTER INSERT ON products FOR EACH ROW EXECUTE FUNCTION app.seed_product_inventory();

CREATE FUNCTION app.capture_legacy_stock_edit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE location uuid; current_available integer; change integer;
BEGIN
  IF pg_trigger_depth()>1 OR NEW.stock IS NOT DISTINCT FROM OLD.stock THEN RETURN NEW; END IF;
  SELECT b.location_id,b.on_hand-b.reserved INTO location,current_available
  FROM public.inventory_balances b JOIN public.inventory_locations l ON l.id=b.location_id
  WHERE b.product_id=NEW.id AND l.code='default' FOR UPDATE OF b;
  IF location IS NULL THEN RAISE EXCEPTION 'Default inventory balance is missing'; END IF;
  change := NEW.stock-current_available;
  IF change<>0 THEN
    UPDATE public.inventory_balances SET on_hand=on_hand+change,updated_at=now()
      WHERE product_id=NEW.id AND location_id=location;
    INSERT INTO public.inventory_movements(idempotency_key,seller_id,product_id,location_id,reason,delta_on_hand,actor_id,note)
      VALUES('legacy-edit:'||NEW.id||':'||gen_random_uuid(),NEW.seller_id,NEW.id,location,'seller_correction',change,app.actor_id(),'Compatibility stock edit');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER products_stock_to_inventory BEFORE UPDATE OF stock ON products
FOR EACH ROW EXECUTE FUNCTION app.capture_legacy_stock_edit();

CREATE FUNCTION app.reserve_inventory(p_product uuid,p_quantity integer,p_key uuid,p_expires_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE balance public.inventory_balances%ROWTYPE; existing public.inventory_reservations%ROWTYPE; result uuid; stale record;
BEGIN
  IF app.actor_role() NOT IN ('checkout','platform','seller') THEN RAISE EXCEPTION 'Inventory reservation is not authorized' USING ERRCODE='insufficient_privilege'; END IF;
  IF p_quantity<=0 OR p_expires_at<=now() THEN RAISE EXCEPTION 'Quantity and future expiry are required' USING ERRCODE='check_violation'; END IF;
  SELECT * INTO existing FROM public.inventory_reservations WHERE idempotency_key=p_key;
  IF FOUND THEN
    IF existing.product_id<>p_product OR existing.quantity<>p_quantity THEN RAISE EXCEPTION 'Inventory idempotency key was reused with different input' USING ERRCODE='unique_violation'; END IF;
    RETURN existing.id;
  END IF;
  SELECT b.* INTO balance FROM public.inventory_balances b JOIN public.inventory_locations l ON l.id=b.location_id
    WHERE b.product_id=p_product AND l.code='default' FOR UPDATE OF b;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory balance not found' USING ERRCODE='foreign_key_violation'; END IF;
  IF app.actor_role()='seller' AND balance.seller_id IS DISTINCT FROM app.staff_seller_id() THEN RAISE EXCEPTION 'Inventory reservation is not authorized' USING ERRCODE='insufficient_privilege'; END IF;
  FOR stale IN SELECT * FROM public.inventory_reservations WHERE product_id=p_product AND location_id=balance.location_id AND status='active' AND expires_at<=now() FOR UPDATE LOOP
    UPDATE public.inventory_reservations SET status='expired',released_at=now() WHERE id=stale.id;
    UPDATE public.inventory_balances SET reserved=reserved-stale.quantity,updated_at=now() WHERE product_id=p_product AND location_id=balance.location_id;
    INSERT INTO public.inventory_movements(idempotency_key,seller_id,product_id,location_id,reservation_id,reason,delta_reserved,note)
      VALUES('expire:'||stale.id,balance.seller_id,p_product,balance.location_id,stale.id,'release',-stale.quantity,'Expired reservation');
    balance.reserved:=balance.reserved-stale.quantity;
  END LOOP;
  IF balance.on_hand-balance.reserved<p_quantity THEN RAISE EXCEPTION 'Insufficient available inventory' USING ERRCODE='check_violation'; END IF;
  INSERT INTO public.inventory_reservations(idempotency_key,product_id,location_id,seller_id,quantity,expires_at)
    VALUES(p_key,p_product,balance.location_id,balance.seller_id,p_quantity,p_expires_at) RETURNING id INTO result;
  UPDATE public.inventory_balances SET reserved=reserved+p_quantity,updated_at=now() WHERE product_id=p_product AND location_id=balance.location_id;
  INSERT INTO public.inventory_movements(idempotency_key,seller_id,product_id,location_id,reservation_id,reason,delta_reserved,actor_id)
    VALUES('reserve:'||result,balance.seller_id,p_product,balance.location_id,result,'reservation',p_quantity,app.actor_id());
  RETURN result;
END $$;

CREATE FUNCTION app.release_inventory(p_reservation uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r public.inventory_reservations%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.inventory_reservations WHERE id=p_reservation FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation not found' USING ERRCODE='no_data_found'; END IF;
  IF app.actor_role() NOT IN ('checkout','platform','seller') OR (app.actor_role()='seller' AND r.seller_id IS DISTINCT FROM app.staff_seller_id()) THEN RAISE EXCEPTION 'Inventory release is not authorized' USING ERRCODE='insufficient_privilege'; END IF;
  IF r.status<>'active' THEN RETURN; END IF;
  UPDATE public.inventory_balances SET reserved=reserved-r.quantity,updated_at=now() WHERE product_id=r.product_id AND location_id=r.location_id;
  UPDATE public.inventory_reservations SET status='released',released_at=now() WHERE id=r.id;
  INSERT INTO public.inventory_movements(idempotency_key,seller_id,product_id,location_id,reservation_id,reason,delta_reserved,actor_id)
    VALUES('release:'||r.id,r.seller_id,r.product_id,r.location_id,r.id,'release',-r.quantity,app.actor_id());
END $$;

CREATE FUNCTION app.consume_inventory(p_reservation uuid,p_line_item uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r public.inventory_reservations%ROWTYPE; line_product uuid; line_quantity integer;
BEGIN
  IF app.actor_role() NOT IN ('checkout','platform') THEN RAISE EXCEPTION 'Inventory consumption is not authorized' USING ERRCODE='insufficient_privilege'; END IF;
  SELECT * INTO r FROM public.inventory_reservations WHERE id=p_reservation FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation not found' USING ERRCODE='no_data_found'; END IF;
  IF r.status='consumed' AND r.order_line_item_id=p_line_item THEN RETURN; END IF;
  IF r.status<>'active' OR r.expires_at<=now() THEN RAISE EXCEPTION 'Reservation is not active' USING ERRCODE='check_violation'; END IF;
  SELECT product_id,quantity INTO line_product,line_quantity FROM public.order_line_items WHERE id=p_line_item;
  IF line_product IS DISTINCT FROM r.product_id OR line_quantity IS DISTINCT FROM r.quantity THEN RAISE EXCEPTION 'Reservation does not match order line' USING ERRCODE='check_violation'; END IF;
  UPDATE public.inventory_balances SET on_hand=on_hand-r.quantity,reserved=reserved-r.quantity,updated_at=now() WHERE product_id=r.product_id AND location_id=r.location_id;
  UPDATE public.inventory_reservations SET status='consumed',consumed_at=now(),order_line_item_id=p_line_item WHERE id=r.id;
  INSERT INTO public.inventory_movements(idempotency_key,seller_id,product_id,location_id,reservation_id,reason,delta_on_hand,delta_reserved,actor_id)
    VALUES('consume:'||r.id,r.seller_id,r.product_id,r.location_id,r.id,'sale',-r.quantity,-r.quantity,app.actor_id());
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT sub_order_id FROM payout_lines GROUP BY sub_order_id HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Duplicate sub-orders already exist across payout statements; review before migration';
  END IF;
END $$;
CREATE UNIQUE INDEX payout_lines_sub_order_once_key ON payout_lines(sub_order_id);

CREATE TABLE payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  provider text NOT NULL, idempotency_key uuid NOT NULL, provider_attempt_id text,
  amount_piastres integer NOT NULL CHECK(amount_piastres>0), currency text NOT NULL DEFAULT 'EGP' CHECK(currency='EGP'),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','authorised','captured','failed','cancelled','refunded')),
  failure_code text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider,idempotency_key)
);
CREATE UNIQUE INDEX payment_attempts_provider_ref_key ON payment_attempts(provider,provider_attempt_id) WHERE provider_attempt_id IS NOT NULL;
CREATE INDEX payment_attempts_order_idx ON payment_attempts(order_id,created_at);

CREATE FUNCTION app.guard_payment_attempt() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Payment attempts cannot be deleted' USING ERRCODE='insufficient_privilege'; END IF;
  IF (NEW.order_id,NEW.provider,NEW.idempotency_key,NEW.amount_piastres,NEW.currency)
    IS DISTINCT FROM (OLD.order_id,OLD.provider,OLD.idempotency_key,OLD.amount_piastres,OLD.currency) THEN
    RAISE EXCEPTION 'Payment attempt financial identity and amount are immutable' USING ERRCODE='check_violation';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT ((OLD.status,NEW.status) IN
    (('pending','authorised'),('pending','captured'),('pending','failed'),('pending','cancelled'),
     ('authorised','captured'),('authorised','failed'),('authorised','cancelled'),('captured','refunded'))) THEN
    RAISE EXCEPTION 'Illegal payment attempt transition: % to %',OLD.status,NEW.status USING ERRCODE='check_violation';
  END IF;
  NEW.updated_at:=now(); RETURN NEW;
END $$;
CREATE TRIGGER payment_attempts_guard BEFORE UPDATE OR DELETE ON payment_attempts FOR EACH ROW EXECUTE FUNCTION app.guard_payment_attempt();

CREATE TABLE refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  return_id uuid REFERENCES returns(id) ON DELETE RESTRICT, provider text NOT NULL,
  idempotency_key uuid NOT NULL, provider_ref text, amount_piastres integer NOT NULL CHECK(amount_piastres>0),
  status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','submitted','succeeded','failed','cancelled')),
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  UNIQUE(provider,idempotency_key)
);
CREATE UNIQUE INDEX refunds_provider_ref_key ON refunds(provider,provider_ref) WHERE provider_ref IS NOT NULL;

CREATE FUNCTION app.guard_refund() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE order_total integer; already_refunded bigint; linked_order uuid;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.order_id,NEW.return_id,NEW.provider,NEW.idempotency_key,NEW.amount_piastres)
    IS DISTINCT FROM (OLD.order_id,OLD.return_id,OLD.provider,OLD.idempotency_key,OLD.amount_piastres) THEN
    RAISE EXCEPTION 'Refund financial identity and amount are immutable' USING ERRCODE='check_violation';
  END IF;
  IF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NOT ((OLD.status,NEW.status) IN
    (('requested','submitted'),('requested','cancelled'),('requested','failed'),('submitted','succeeded'),('submitted','failed'))) THEN
    RAISE EXCEPTION 'Illegal refund transition: % to %',OLD.status,NEW.status USING ERRCODE='check_violation';
  END IF;
  IF (NEW.status='succeeded')<>(NEW.completed_at IS NOT NULL) THEN RAISE EXCEPTION 'Successful refund requires completion time' USING ERRCODE='check_violation'; END IF;
  SELECT total_piastres INTO order_total FROM public.orders WHERE id=NEW.order_id FOR UPDATE;
  IF NEW.return_id IS NOT NULL THEN
    SELECT s.order_id INTO linked_order FROM public.returns r JOIN public.sub_orders s ON s.id=r.sub_order_id WHERE r.id=NEW.return_id;
    IF linked_order IS DISTINCT FROM NEW.order_id THEN RAISE EXCEPTION 'Refund return must belong to the same order' USING ERRCODE='foreign_key_violation'; END IF;
  END IF;
  SELECT COALESCE(sum(amount_piastres),0) INTO already_refunded FROM public.refunds
    WHERE order_id=NEW.order_id AND id<>NEW.id AND status NOT IN ('failed','cancelled');
  IF NEW.status NOT IN ('failed','cancelled') AND already_refunded+NEW.amount_piastres>order_total THEN
    RAISE EXCEPTION 'Refunds exceed order total' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER refunds_guard BEFORE INSERT OR UPDATE ON refunds FOR EACH ROW EXECUTE FUNCTION app.guard_refund();
CREATE TABLE refund_allocations (
  refund_id uuid NOT NULL REFERENCES refunds(id) ON DELETE RESTRICT,
  line_item_id uuid NOT NULL REFERENCES order_line_items(id) ON DELETE RESTRICT,
  amount_piastres integer NOT NULL CHECK(amount_piastres>0), PRIMARY KEY(refund_id,line_item_id)
);

CREATE FUNCTION app.guard_refund_allocation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE refund_order uuid; refund_amount integer; refund_status text; line_order uuid; allocated bigint;
BEGIN
  SELECT order_id,amount_piastres,status INTO refund_order,refund_amount,refund_status FROM public.refunds WHERE id=NEW.refund_id FOR UPDATE;
  IF refund_status='succeeded' THEN RAISE EXCEPTION 'Completed refund allocations are immutable' USING ERRCODE='insufficient_privilege'; END IF;
  SELECT s.order_id INTO line_order FROM public.order_line_items l JOIN public.sub_orders s ON s.id=l.sub_order_id WHERE l.id=NEW.line_item_id;
  IF refund_order IS NULL OR line_order IS DISTINCT FROM refund_order THEN RAISE EXCEPTION 'Refund allocation must belong to the same order' USING ERRCODE='foreign_key_violation'; END IF;
  SELECT COALESCE(sum(amount_piastres),0) INTO allocated FROM public.refund_allocations WHERE refund_id=NEW.refund_id AND line_item_id<>NEW.line_item_id;
  IF allocated+NEW.amount_piastres>refund_amount THEN RAISE EXCEPTION 'Refund allocations exceed refund amount' USING ERRCODE='check_violation'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER refund_allocations_guard BEFORE INSERT OR UPDATE ON refund_allocations FOR EACH ROW EXECUTE FUNCTION app.guard_refund_allocation();
CREATE FUNCTION app.guard_refund_allocation_delete() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE refund_status text;
BEGIN SELECT status INTO refund_status FROM public.refunds WHERE id=OLD.refund_id FOR UPDATE;
  IF refund_status='succeeded' THEN RAISE EXCEPTION 'Completed refund allocations are immutable' USING ERRCODE='insufficient_privilege'; END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER refund_allocations_delete_guard BEFORE DELETE ON refund_allocations FOR EACH ROW EXECUTE FUNCTION app.guard_refund_allocation_delete();

CREATE TABLE financial_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), idempotency_key text NOT NULL UNIQUE,
  seller_id uuid REFERENCES sellers(id) ON DELETE RESTRICT, order_id uuid REFERENCES orders(id) ON DELETE RESTRICT,
  sub_order_id uuid REFERENCES sub_orders(id) ON DELETE RESTRICT, payout_id uuid REFERENCES payouts(id) ON DELETE RESTRICT,
  refund_id uuid REFERENCES refunds(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK(kind IN ('sale','commission','shipping','refund','refund_reversal','adjustment','payout','payment','payment_reversal')),
  amount_piastres integer NOT NULL CHECK(amount_piastres<>0), currency text NOT NULL DEFAULT 'EGP' CHECK(currency='EGP'),
  external_ref text, occurred_at timestamptz NOT NULL DEFAULT now(), created_by uuid
);
CREATE INDEX financial_postings_seller_time_idx ON financial_postings(seller_id,occurred_at);
CREATE INDEX financial_postings_order_idx ON financial_postings(order_id);

CREATE FUNCTION app.immutable_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% is append-only',TG_TABLE_NAME USING ERRCODE='insufficient_privilege'; END $$;
CREATE TRIGGER inventory_movements_immutable BEFORE UPDATE OR DELETE ON inventory_movements FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
CREATE TRIGGER financial_postings_immutable BEFORE UPDATE OR DELETE ON financial_postings FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
CREATE TRIGGER refunds_no_delete BEFORE DELETE ON refunds FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
CREATE TRIGGER payout_lines_immutable BEFORE UPDATE OR DELETE ON payout_lines FOR EACH ROW EXECUTE FUNCTION app.immutable_record();

CREATE FUNCTION app.guard_financial_posting_tenant() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE linked_seller uuid; linked_order uuid;
BEGIN
  IF NEW.sub_order_id IS NOT NULL THEN SELECT seller_id,order_id INTO linked_seller,linked_order FROM public.sub_orders WHERE id=NEW.sub_order_id;
    IF NEW.seller_id IS DISTINCT FROM linked_seller OR (NEW.order_id IS NOT NULL AND NEW.order_id IS DISTINCT FROM linked_order) THEN RAISE EXCEPTION 'Posting sub-order tenant or order mismatch' USING ERRCODE='foreign_key_violation'; END IF;
  END IF;
  IF NEW.payout_id IS NOT NULL THEN SELECT seller_id INTO linked_seller FROM public.payouts WHERE id=NEW.payout_id;
    IF NEW.seller_id IS DISTINCT FROM linked_seller THEN RAISE EXCEPTION 'Posting payout tenant mismatch' USING ERRCODE='foreign_key_violation'; END IF;
  END IF;
  IF NEW.refund_id IS NOT NULL THEN SELECT order_id INTO linked_order FROM public.refunds WHERE id=NEW.refund_id;
    IF NEW.order_id IS DISTINCT FROM linked_order THEN RAISE EXCEPTION 'Posting refund order mismatch' USING ERRCODE='foreign_key_violation'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER financial_postings_tenant_guard BEFORE INSERT ON financial_postings FOR EACH ROW EXECUTE FUNCTION app.guard_financial_posting_tenant();

ALTER TABLE inventory_locations ENABLE ROW LEVEL SECURITY; ALTER TABLE inventory_locations FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory_balances ENABLE ROW LEVEL SECURITY; ALTER TABLE inventory_balances FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory_reservations ENABLE ROW LEVEL SECURITY; ALTER TABLE inventory_reservations FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY; ALTER TABLE inventory_movements FORCE ROW LEVEL SECURITY;
ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY; ALTER TABLE payment_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY; ALTER TABLE refunds FORCE ROW LEVEL SECURITY;
ALTER TABLE refund_allocations ENABLE ROW LEVEL SECURITY; ALTER TABLE refund_allocations FORCE ROW LEVEL SECURITY;
ALTER TABLE financial_postings ENABLE ROW LEVEL SECURITY; ALTER TABLE financial_postings FORCE ROW LEVEL SECURITY;

CREATE POLICY inventory_locations_read ON inventory_locations FOR SELECT USING(app.is_platform() OR seller_id=app.staff_seller_id());
CREATE POLICY inventory_locations_platform_write ON inventory_locations FOR ALL USING(app.is_platform()) WITH CHECK(app.is_platform());
CREATE POLICY inventory_balances_read ON inventory_balances FOR SELECT USING(app.is_platform() OR seller_id=app.staff_seller_id());
CREATE POLICY inventory_reservations_read ON inventory_reservations FOR SELECT USING(app.is_platform() OR seller_id=app.staff_seller_id());
CREATE POLICY inventory_movements_read ON inventory_movements FOR SELECT USING(app.is_platform() OR seller_id=app.staff_seller_id());
CREATE POLICY payment_attempts_platform ON payment_attempts FOR ALL USING(app.is_platform()) WITH CHECK(app.is_platform());
CREATE POLICY refunds_platform ON refunds FOR ALL USING(app.is_platform()) WITH CHECK(app.is_platform());
CREATE POLICY refund_allocations_platform ON refund_allocations FOR ALL USING(app.is_platform()) WITH CHECK(app.is_platform());
CREATE POLICY financial_postings_platform ON financial_postings FOR ALL USING(app.is_platform()) WITH CHECK(app.is_platform());
CREATE POLICY financial_postings_seller_read ON financial_postings FOR SELECT USING(seller_id=app.staff_seller_id());

REVOKE INSERT,UPDATE,DELETE ON inventory_balances,inventory_reservations,inventory_movements FROM app_user;
REVOKE DELETE ON inventory_locations FROM app_user;
REVOKE UPDATE,DELETE ON financial_postings FROM app_user;
GRANT SELECT,INSERT,UPDATE ON inventory_locations TO app_user;
GRANT SELECT ON inventory_balances,inventory_reservations,inventory_movements TO app_user;
GRANT SELECT,INSERT ON financial_postings TO app_user;
REVOKE ALL ON FUNCTION app.reserve_inventory(uuid,integer,uuid,timestamptz),app.release_inventory(uuid),app.consume_inventory(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reserve_inventory(uuid,integer,uuid,timestamptz),app.release_inventory(uuid),app.consume_inventory(uuid,uuid) TO app_user;
