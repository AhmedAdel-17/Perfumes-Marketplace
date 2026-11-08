-- 0043 — Atomic inventory reservations and an append-only stock trail.
-- Pattern: transactional reservation + immutable movement journal. Existing
-- product stock remains on-hand; availability is on-hand minus active holds.
-- No historical quantities or financial records are rewritten. Legacy open
-- orders acquire a hold at confirmation/dispatch, or fail for manual review.
-- rollback: roll back application readers first; retain these tables/history.
-- Disable the three inventory triggers only during a reviewed checkout freeze.

-- The existing invoker publish gate is also reached by trigger-owned inventory
-- updates. Pin its own lookup path so verification stays enforced in that scope.
ALTER FUNCTION public.enforce_publish_gate() SET search_path=pg_catalog,public,pg_temp;

ALTER TABLE products ADD COLUMN reserved_stock integer NOT NULL DEFAULT 0;
ALTER TABLE products ADD CONSTRAINT products_inventory_balance CHECK(reserved_stock>=0 AND coalesce(stock,0)>=reserved_stock);
CREATE INDEX products_seller_updated_page_idx ON products(seller_id,updated_at DESC,id DESC);

CREATE TABLE inventory_reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 line_item_id uuid NOT NULL UNIQUE REFERENCES order_line_items(id) ON DELETE RESTRICT,
 sub_order_id uuid NOT NULL REFERENCES sub_orders(id) ON DELETE RESTRICT,
 product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
 quantity integer NOT NULL CHECK(quantity > 0),
 state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','consumed','released')),
 created_at timestamptz NOT NULL DEFAULT now(),
 closed_at timestamptz,
 CHECK((state='active') = (closed_at IS NULL))
);
CREATE INDEX inventory_reservations_active_product_idx ON inventory_reservations(product_id) WHERE state='active';
CREATE INDEX inventory_reservations_sub_order_idx ON inventory_reservations(sub_order_id,state);
CREATE INDEX inventory_reservations_seller_idx ON inventory_reservations(seller_id);

CREATE TABLE inventory_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
 line_item_id uuid REFERENCES order_line_items(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK(kind IN ('opening','reserve','release','dispatch','adjust','listing_edit')),
 delta_on_hand integer NOT NULL,
 delta_reserved integer NOT NULL,
 reason text NOT NULL CHECK(reason IN ('opening','checkout','cancelled','rejected','dispatch','listing_edit','restock','count_correction','damage','return_inspected')),
 stock_before integer,
 stock_after integer,
 request_id uuid,
 actor_id uuid,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_movements_product_time_idx ON inventory_movements(product_id,occurred_at DESC,id DESC);
CREATE INDEX inventory_movements_seller_idx ON inventory_movements(seller_id);
CREATE UNIQUE INDEX inventory_movements_adjust_request_key ON inventory_movements(seller_id,request_id) WHERE request_id IS NOT NULL;

ALTER TABLE inventory_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_reservations FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements FORCE ROW LEVEL SECURITY;
CREATE POLICY seller_read_inventory_reservations ON inventory_reservations FOR SELECT USING (seller_id=app.staff_seller_id());
CREATE POLICY platform_read_inventory_reservations ON inventory_reservations FOR SELECT USING (app.actor_role()='platform');
CREATE POLICY seller_read_inventory_movements ON inventory_movements FOR SELECT USING (seller_id=app.staff_seller_id());
CREATE POLICY platform_read_inventory_movements ON inventory_movements FOR SELECT USING (app.actor_role()='platform');
GRANT SELECT ON inventory_reservations,inventory_movements TO app_user;

-- Trigger-only capability. Runtime users cannot call this or write the journal.
-- Its owner is the existing migration principal, as with identity capabilities.
CREATE FUNCTION app.inventory_hold_line(p_line uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE li record; p record; held bigint; prior public.inventory_reservations;
BEGIN
 SELECT l.*,s.seller_id,s.state AS order_state INTO li
 FROM public.order_line_items l JOIN public.sub_orders s ON s.id=l.sub_order_id WHERE l.id=p_line;
 IF NOT FOUND THEN RAISE EXCEPTION 'inventory line not found'; END IF;
 SELECT * INTO p FROM public.products WHERE id=li.product_id FOR UPDATE;
 IF p.seller_id<>li.seller_id THEN RAISE EXCEPTION 'inventory tenant mismatch'; END IF;
 SELECT * INTO prior FROM public.inventory_reservations WHERE line_item_id=p_line;
 IF FOUND THEN
  IF prior.state='released' THEN RAISE EXCEPTION 'released inventory cannot be reused'; END IF;
  RETURN;
 END IF;
 SELECT coalesce(sum(quantity),0) INTO held FROM public.inventory_reservations WHERE product_id=p.id AND state='active';
 IF p.stock IS NULL OR p.stock-held<li.quantity THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='inventory unavailable; review stock before confirming this order';
 END IF;
 INSERT INTO public.inventory_reservations(line_item_id,sub_order_id,product_id,seller_id,quantity)
 VALUES(li.id,li.sub_order_id,p.id,li.seller_id,li.quantity);
 UPDATE public.products SET reserved_stock=reserved_stock+li.quantity WHERE id=p.id;
 INSERT INTO public.inventory_movements(product_id,seller_id,line_item_id,kind,delta_on_hand,delta_reserved,reason,actor_id)
 VALUES(p.id,li.seller_id,li.id,'reserve',0,li.quantity,'checkout',app.actor_id());
END $$;
REVOKE ALL ON FUNCTION app.inventory_hold_line(uuid) FROM PUBLIC,app_user;

CREATE FUNCTION app.inventory_line_inserted() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE order_state text;
BEGIN
 SELECT state::text INTO order_state FROM public.sub_orders WHERE id=NEW.sub_order_id;
 IF order_state IN ('placed','awaiting_seller','confirmed') THEN PERFORM app.inventory_hold_line(NEW.id); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.inventory_line_inserted() FROM PUBLIC,app_user;
CREATE TRIGGER inventory_line_inserted AFTER INSERT ON order_line_items FOR EACH ROW EXECUTE FUNCTION app.inventory_line_inserted();

CREATE FUNCTION app.inventory_order_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE li record; hold public.inventory_reservations; before_stock integer;
BEGIN
 IF NEW.state=OLD.state THEN RETURN NEW; END IF;
 IF NEW.state IN ('confirmed','dispatched') THEN
  -- Consistent product ordering prevents competing fulfilment paths deadlocking.
  FOR li IN SELECT id FROM public.order_line_items WHERE sub_order_id=NEW.id ORDER BY product_id,id LOOP
   PERFORM app.inventory_hold_line(li.id);
  END LOOP;
 END IF;
 IF NEW.state NOT IN ('dispatched','cancelled','rejected') THEN RETURN NEW; END IF;
 FOR hold IN SELECT * FROM public.inventory_reservations WHERE sub_order_id=NEW.id AND state='active' ORDER BY product_id,line_item_id LOOP
  SELECT stock INTO before_stock FROM public.products WHERE id=hold.product_id FOR UPDATE;
  UPDATE public.inventory_reservations SET state=CASE WHEN NEW.state='dispatched' THEN 'consumed' ELSE 'released' END,closed_at=now() WHERE id=hold.id AND state='active';
  IF NEW.state='dispatched' THEN
   UPDATE public.products SET stock=stock-hold.quantity,reserved_stock=reserved_stock-hold.quantity WHERE id=hold.product_id;
  ELSE
   UPDATE public.products SET reserved_stock=reserved_stock-hold.quantity WHERE id=hold.product_id;
  END IF;
  INSERT INTO public.inventory_movements(product_id,seller_id,line_item_id,kind,delta_on_hand,delta_reserved,reason,stock_before,stock_after,actor_id)
   VALUES(hold.product_id,hold.seller_id,hold.line_item_id,CASE WHEN NEW.state='dispatched' THEN 'dispatch' ELSE 'release' END,
    CASE WHEN NEW.state='dispatched' THEN -hold.quantity ELSE 0 END,-hold.quantity,
    CASE WHEN NEW.state='dispatched' THEN 'dispatch' ELSE NEW.state::text END,before_stock,
    CASE WHEN NEW.state='dispatched' THEN before_stock-hold.quantity ELSE before_stock END,app.actor_id());
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.inventory_order_changed() FROM PUBLIC,app_user;
CREATE TRIGGER inventory_order_changed AFTER UPDATE OF state ON sub_orders FOR EACH ROW EXECUTE FUNCTION app.inventory_order_changed();

CREATE FUNCTION app.inventory_stock_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE held bigint; why text; request_key uuid; at_time timestamptz;
BEGIN
 IF NEW.reserved_stock IS DISTINCT FROM OLD.reserved_stock AND pg_trigger_depth()<2 THEN
  RAISE EXCEPTION 'reserved stock is generated by inventory operations' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(sum(quantity),0) INTO held FROM public.inventory_reservations WHERE product_id=NEW.id AND state='active';
 IF NEW.reserved_stock<>held THEN RAISE EXCEPTION 'inventory reservation counter mismatch'; END IF;
 IF NEW.stock IS NOT NULL AND NEW.stock<held THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='stock cannot fall below reserved quantity'; END IF;
 IF NEW.stock IS NOT DISTINCT FROM OLD.stock THEN RETURN NEW; END IF;
 -- Dispatch already records one combined physical/reservation movement. Only
 -- the trigger-owned nested stock update may take this branch; runtime users
 -- have no trigger creation privilege or direct inventory helper capability.
 IF pg_trigger_depth()>1 THEN RETURN NEW; END IF;
 why:=coalesce(nullif(current_setting('app.inventory_reason',true),''),'listing_edit');
 IF why NOT IN ('restock','count_correction','damage','return_inspected','listing_edit') THEN why:='listing_edit'; END IF;
 request_key:=nullif(current_setting('app.inventory_request_id',true),'')::uuid;
 at_time:=coalesce(nullif(current_setting('app.inventory_at',true),'')::timestamptz,now());
 INSERT INTO public.inventory_movements(product_id,seller_id,kind,delta_on_hand,delta_reserved,reason,stock_before,stock_after,request_id,actor_id,occurred_at)
 VALUES(NEW.id,NEW.seller_id,CASE WHEN request_key IS NULL THEN 'listing_edit' ELSE 'adjust' END,coalesce(NEW.stock,0)-coalesce(OLD.stock,0),0,why,coalesce(OLD.stock,0),coalesce(NEW.stock,0),request_key,app.actor_id(),at_time);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.inventory_stock_guard() FROM PUBLIC,app_user;
CREATE TRIGGER inventory_stock_guard BEFORE UPDATE OF stock,reserved_stock ON products FOR EACH ROW EXECUTE FUNCTION app.inventory_stock_guard();

CREATE FUNCTION app.inventory_line_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.inventory_reservations WHERE line_item_id=OLD.id)
 AND (TG_OP='DELETE' OR NEW.quantity IS DISTINCT FROM OLD.quantity OR NEW.product_id IS DISTINCT FROM OLD.product_id OR NEW.sub_order_id IS DISTINCT FROM OLD.sub_order_id) THEN
  RAISE EXCEPTION 'reserved order lines are immutable';
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION app.inventory_line_immutable() FROM PUBLIC,app_user;
CREATE TRIGGER inventory_line_immutable BEFORE UPDATE OR DELETE ON order_line_items FOR EACH ROW EXECUTE FUNCTION app.inventory_line_immutable();

CREATE FUNCTION app.inventory_journal_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'inventory journal is append-only'; END $$;
REVOKE ALL ON FUNCTION app.inventory_journal_immutable() FROM PUBLIC,app_user;
CREATE TRIGGER inventory_journal_immutable BEFORE UPDATE OR DELETE ON inventory_movements FOR EACH ROW EXECUTE FUNCTION app.inventory_journal_immutable();

-- Explicit cutover balances, not invented historical movements.
INSERT INTO inventory_movements(product_id,seller_id,kind,delta_on_hand,delta_reserved,reason,stock_before,stock_after)
SELECT id,seller_id,'opening',coalesce(stock,0),0,'opening',0,coalesce(stock,0) FROM products;

CREATE FUNCTION app.inventory_product_opened() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.reserved_stock<>0 THEN RAISE EXCEPTION 'new stock cannot start reserved'; END IF;
 INSERT INTO public.inventory_movements(product_id,seller_id,kind,delta_on_hand,delta_reserved,reason,stock_before,stock_after,actor_id)
 VALUES(NEW.id,NEW.seller_id,'opening',coalesce(NEW.stock,0),0,'opening',0,coalesce(NEW.stock,0),app.actor_id());
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.inventory_product_opened() FROM PUBLIC,app_user;
CREATE TRIGGER inventory_product_opened AFTER INSERT ON products FOR EACH ROW EXECUTE FUNCTION app.inventory_product_opened();
