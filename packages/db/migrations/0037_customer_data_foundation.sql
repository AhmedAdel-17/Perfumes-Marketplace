-- =============================================================================
-- 0037 — structured customer data foundation
--
-- Demographics and preferences describe a customer. Behaviour events describe
-- observations. Orders, returns and reviews remain the authoritative business
-- facts. No model, feature store or derived score is introduced here.
-- =============================================================================

ALTER TYPE consent_purpose ADD VALUE IF NOT EXISTS 'personalization';--> statement-breakpoint
ALTER TYPE consent_purpose ADD VALUE IF NOT EXISTS 'model_training';--> statement-breakpoint

CREATE TYPE customer_gender AS ENUM (
  'female', 'male', 'non_binary', 'prefer_not_to_say'
);--> statement-breakpoint
CREATE TYPE customer_data_source AS ENUM (
  'customer', 'checkout', 'support', 'platform_import'
);--> statement-breakpoint
CREATE TYPE customer_event_channel AS ENUM (
  'web', 'mobile_web', 'ios', 'android', 'server'
);--> statement-breakpoint
CREATE TYPE customer_event_name AS ENUM (
  'product_viewed', 'searched', 'wishlisted', 'cart_added',
  'purchased', 'reviewed', 'returned', 'cancelled'
);--> statement-breakpoint

-- A profile row is complete by construction: birth date and gender are never
-- nullable. Legacy and guest customers may have no row until data is collected.
CREATE TABLE customer_profiles (
  customer_id uuid PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  birth_date date NOT NULL,
  gender customer_gender NOT NULL,
  data_source customer_data_source NOT NULL,
  collected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  retention_until timestamptz,
  CONSTRAINT customer_profiles_birth_date_plausible
    CHECK (birth_date BETWEEN DATE '1900-01-01' AND CURRENT_DATE),
  CONSTRAINT customer_profiles_retention_after_collection
    CHECK (retention_until IS NULL OR retention_until >= collected_at)
);--> statement-breakpoint
CREATE INDEX customer_profiles_gender_idx ON customer_profiles(gender);--> statement-breakpoint
CREATE INDEX customer_profiles_birth_date_idx ON customer_profiles(birth_date);--> statement-breakpoint
CREATE INDEX customer_profiles_retention_idx ON customer_profiles(retention_until)
  WHERE retention_until IS NOT NULL;--> statement-breakpoint

COMMENT ON TABLE customer_profiles IS
  'One complete demographic profile per customer. Age is derived from birth_date and is never stored.';--> statement-breakpoint
COMMENT ON COLUMN customer_profiles.birth_date IS
  'Required date of birth. Use app.age_years(birth_date) to calculate current age.';--> statement-breakpoint
COMMENT ON COLUMN customer_profiles.gender IS
  'Required controlled customer gender value.';--> statement-breakpoint
COMMENT ON COLUMN customer_profiles.data_source IS
  'Where the current profile values were collected.';--> statement-breakpoint
COMMENT ON COLUMN customer_profiles.collected_at IS
  'Time this profile was first collected.';--> statement-breakpoint
COMMENT ON COLUMN customer_profiles.updated_at IS
  'Time profile values last changed; maintained by a trigger.';--> statement-breakpoint
COMMENT ON COLUMN customer_profiles.retention_until IS
  'Optional reviewed erasure/retention deadline; null means governed by the active retention policy.';--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.age_years(birth_date date) RETURNS integer
LANGUAGE sql STABLE STRICT AS $$
  SELECT date_part('year', age(CURRENT_DATE, birth_date))::integer
$$;--> statement-breakpoint

CREATE TABLE customer_fragrance_preferences (
  customer_id uuid PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  fragrance_families scent_family[] NOT NULL DEFAULT '{}',
  occasions occasion[] NOT NULL DEFAULT '{}',
  seasons season[] NOT NULL DEFAULT '{}',
  concentrations concentration[] NOT NULL DEFAULT '{}',
  day_night day_night[] NOT NULL DEFAULT '{}',
  budget_min_piastres integer,
  budget_max_piastres integer,
  preferred_bottle_sizes_ml integer[] NOT NULL DEFAULT '{}',
  data_source customer_data_source NOT NULL,
  collected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  retention_until timestamptz,
  CONSTRAINT customer_preferences_budget_nonnegative CHECK (
    (budget_min_piastres IS NULL OR budget_min_piastres >= 0)
    AND (budget_max_piastres IS NULL OR budget_max_piastres >= 0)
  ),
  CONSTRAINT customer_preferences_budget_ordered CHECK (
    budget_min_piastres IS NULL OR budget_max_piastres IS NULL
    OR budget_min_piastres <= budget_max_piastres
  ),
  CONSTRAINT customer_preferences_sizes_positive CHECK (0 < ALL(preferred_bottle_sizes_ml)),
  CONSTRAINT customer_preferences_retention_after_collection
    CHECK (retention_until IS NULL OR retention_until >= collected_at)
);--> statement-breakpoint

COMMENT ON TABLE customer_fragrance_preferences IS
  'Optional structured perfume preferences; empty arrays mean the customer has not supplied that dimension.';--> statement-breakpoint
COMMENT ON COLUMN customer_fragrance_preferences.fragrance_families IS 'Preferred controlled scent families.';--> statement-breakpoint
COMMENT ON COLUMN customer_fragrance_preferences.occasions IS 'Preferred controlled wearing occasions.';--> statement-breakpoint
COMMENT ON COLUMN customer_fragrance_preferences.seasons IS 'Preferred controlled seasons.';--> statement-breakpoint
COMMENT ON COLUMN customer_fragrance_preferences.concentrations IS 'Preferred controlled perfume concentrations.';--> statement-breakpoint
COMMENT ON COLUMN customer_fragrance_preferences.day_night IS 'Preferred controlled day/night usage.';--> statement-breakpoint
COMMENT ON COLUMN customer_fragrance_preferences.budget_min_piastres IS 'Optional minimum budget in integer Egyptian piastres.';--> statement-breakpoint
COMMENT ON COLUMN customer_fragrance_preferences.budget_max_piastres IS 'Optional maximum budget in integer Egyptian piastres.';--> statement-breakpoint
COMMENT ON COLUMN customer_fragrance_preferences.preferred_bottle_sizes_ml IS 'Preferred positive bottle sizes in millilitres.';--> statement-breakpoint
COMMENT ON COLUMN customer_fragrance_preferences.data_source IS 'Where the current preferences were collected.';--> statement-breakpoint
COMMENT ON COLUMN customer_fragrance_preferences.collected_at IS 'Time preferences were first collected.';--> statement-breakpoint
COMMENT ON COLUMN customer_fragrance_preferences.updated_at IS 'Time preferences last changed; maintained by a trigger.';--> statement-breakpoint
COMMENT ON COLUMN customer_fragrance_preferences.retention_until IS 'Optional reviewed erasure/retention deadline.';--> statement-breakpoint

CREATE TABLE customer_preferred_notes (
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  note_ar text NOT NULL REFERENCES note_glossary(ar) ON DELETE RESTRICT,
  data_source customer_data_source NOT NULL,
  collected_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_preferred_notes_pk PRIMARY KEY(customer_id, note_ar)
);--> statement-breakpoint
CREATE INDEX customer_preferred_notes_note_idx ON customer_preferred_notes(note_ar);--> statement-breakpoint

COMMENT ON TABLE customer_preferred_notes IS 'Normalized customer note preferences using the platform note glossary.';--> statement-breakpoint
COMMENT ON COLUMN customer_preferred_notes.customer_id IS 'Customer who selected the note.';--> statement-breakpoint
COMMENT ON COLUMN customer_preferred_notes.note_ar IS 'Canonical Arabic note key from note_glossary.';--> statement-breakpoint
COMMENT ON COLUMN customer_preferred_notes.data_source IS 'Where this preference was collected.';--> statement-breakpoint
COMMENT ON COLUMN customer_preferred_notes.collected_at IS 'Time this note preference was collected.';--> statement-breakpoint

CREATE TABLE customer_data_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_id text NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  channel customer_event_channel NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  linked_at timestamptz,
  retention_until timestamptz,
  CONSTRAINT customer_data_sessions_anonymous_shape CHECK (anonymous_id ~ '^[0-9a-f]{24}$'),
  CONSTRAINT customer_data_sessions_link_consistent CHECK (
    (customer_id IS NULL AND linked_at IS NULL) OR
    (customer_id IS NOT NULL AND linked_at IS NOT NULL)
  ),
  CONSTRAINT customer_data_sessions_retention_after_start
    CHECK (retention_until IS NULL OR retention_until >= started_at)
);--> statement-breakpoint
CREATE UNIQUE INDEX customer_data_sessions_anonymous_key ON customer_data_sessions(anonymous_id);--> statement-breakpoint
CREATE INDEX customer_data_sessions_customer_idx ON customer_data_sessions(customer_id, started_at);--> statement-breakpoint
CREATE INDEX customer_data_sessions_retention_idx ON customer_data_sessions(retention_until)
  WHERE retention_until IS NOT NULL;--> statement-breakpoint

COMMENT ON TABLE customer_data_sessions IS 'Anonymous browsing session that can be linked once to a signed-in customer.';--> statement-breakpoint
COMMENT ON COLUMN customer_data_sessions.anonymous_id IS 'Random 24-character lowercase hexadecimal browser identifier; never email or phone.';--> statement-breakpoint
COMMENT ON COLUMN customer_data_sessions.customer_id IS 'Customer attached after login; null before login or after lawful erasure.';--> statement-breakpoint
COMMENT ON COLUMN customer_data_sessions.channel IS 'Controlled client surface on which the session began.';--> statement-breakpoint
COMMENT ON COLUMN customer_data_sessions.started_at IS 'Database timestamp when the session began.';--> statement-breakpoint
COMMENT ON COLUMN customer_data_sessions.linked_at IS 'Database timestamp when the anonymous session was linked.';--> statement-breakpoint
COMMENT ON COLUMN customer_data_sessions.retention_until IS 'Optional reviewed erasure/retention deadline.';--> statement-breakpoint

CREATE TABLE customer_behavior_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_event_id uuid NOT NULL,
  name customer_event_name NOT NULL,
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  session_id uuid NOT NULL REFERENCES customer_data_sessions(id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  seller_id uuid REFERENCES sellers(id) ON DELETE SET NULL,
  brand_id uuid REFERENCES brands(id) ON DELETE SET NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  channel customer_event_channel NOT NULL,
  retention_until timestamptz NOT NULL DEFAULT (now() + interval '730 days'),
  CONSTRAINT customer_behavior_events_time_sane
    CHECK (occurred_at <= recorded_at + interval '5 minutes'),
  CONSTRAINT customer_behavior_events_retention_after_event
    CHECK (retention_until >= occurred_at),
  CONSTRAINT customer_behavior_events_brand_seller_fk
    FOREIGN KEY(brand_id, seller_id) REFERENCES brands(id, seller_id) ON DELETE SET NULL,
  CONSTRAINT customer_behavior_events_product_seller_fk
    FOREIGN KEY(product_id, seller_id) REFERENCES products(id, seller_id) ON DELETE SET NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX customer_behavior_events_client_key ON customer_behavior_events(client_event_id);--> statement-breakpoint
CREATE INDEX customer_behavior_events_customer_time_idx ON customer_behavior_events(customer_id, occurred_at);--> statement-breakpoint
CREATE INDEX customer_behavior_events_session_time_idx ON customer_behavior_events(session_id, occurred_at);--> statement-breakpoint
CREATE INDEX customer_behavior_events_seller_time_idx ON customer_behavior_events(seller_id, occurred_at);--> statement-breakpoint
CREATE INDEX customer_behavior_events_product_time_idx ON customer_behavior_events(product_id, occurred_at);--> statement-breakpoint
CREATE INDEX customer_behavior_events_name_time_idx ON customer_behavior_events(name, occurred_at);--> statement-breakpoint
CREATE INDEX customer_behavior_events_retention_idx ON customer_behavior_events(retention_until);--> statement-breakpoint

COMMENT ON TABLE customer_behavior_events IS 'Append-only customer observations. Orders and related tables remain the transactional source of truth.';--> statement-breakpoint
COMMENT ON COLUMN customer_behavior_events.client_event_id IS 'Caller UUID used to deduplicate retries.';--> statement-breakpoint
COMMENT ON COLUMN customer_behavior_events.name IS 'Controlled observed behaviour.';--> statement-breakpoint
COMMENT ON COLUMN customer_behavior_events.occurred_at IS 'Time the behaviour occurred at the source.';--> statement-breakpoint
COMMENT ON COLUMN customer_behavior_events.recorded_at IS 'Database receipt time.';--> statement-breakpoint
COMMENT ON COLUMN customer_behavior_events.session_id IS 'Session that produced the event; enables later anonymous linking without rewriting events.';--> statement-breakpoint
COMMENT ON COLUMN customer_behavior_events.customer_id IS 'Customer known when recorded; earlier anonymous events resolve through the linked session.';--> statement-breakpoint
COMMENT ON COLUMN customer_behavior_events.seller_id IS 'Seller context, validated against the product and brand when present.';--> statement-breakpoint
COMMENT ON COLUMN customer_behavior_events.brand_id IS 'Brand context, validated against the seller and product when present.';--> statement-breakpoint
COMMENT ON COLUMN customer_behavior_events.product_id IS 'Current sellable SKU/variant in the implemented DIYAR catalogue.';--> statement-breakpoint
COMMENT ON COLUMN customer_behavior_events.order_id IS 'Optional reference to the authoritative transaction; required for post-order event types.';--> statement-breakpoint
COMMENT ON COLUMN customer_behavior_events.channel IS 'Controlled source channel; must match the session.';--> statement-breakpoint
COMMENT ON COLUMN customer_behavior_events.retention_until IS 'Reviewed deletion deadline; defaults to 730 days and may be changed only before insertion.';--> statement-breakpoint

CREATE TABLE customer_data_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  entity text NOT NULL,
  action text NOT NULL,
  changed_fields text[] NOT NULL,
  source customer_data_source NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_data_changes_entity_known CHECK (entity IN ('profile','preferences','preferred_note')),
  CONSTRAINT customer_data_changes_action_known CHECK (action IN ('insert','update','delete')),
  CONSTRAINT customer_data_changes_fields_present CHECK (cardinality(changed_fields) > 0)
);--> statement-breakpoint
CREATE INDEX customer_data_changes_customer_time_idx ON customer_data_changes(customer_id, occurred_at);--> statement-breakpoint

COMMENT ON TABLE customer_data_changes IS 'Append-only metadata-only update history; old personal values are deliberately not copied here.';--> statement-breakpoint
COMMENT ON COLUMN customer_data_changes.customer_id IS 'Affected customer; set null if the customer is erased.';--> statement-breakpoint
COMMENT ON COLUMN customer_data_changes.entity IS 'Controlled customer data entity that changed.';--> statement-breakpoint
COMMENT ON COLUMN customer_data_changes.action IS 'Insert, update or delete.';--> statement-breakpoint
COMMENT ON COLUMN customer_data_changes.changed_fields IS 'Names of changed fields, without duplicating their personal values.';--> statement-breakpoint
COMMENT ON COLUMN customer_data_changes.source IS 'Source responsible for the change.';--> statement-breakpoint
COMMENT ON COLUMN customer_data_changes.occurred_at IS 'Database time of the change.';--> statement-breakpoint

-- Keep updated_at honest and write value-free change history automatically.
CREATE OR REPLACE FUNCTION app.track_customer_data_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE fields text[]; source_value customer_data_source; customer_value uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
    SELECT coalesce(array_agg(n.key ORDER BY n.key), ARRAY['updated_at']::text[])
      INTO fields
      FROM jsonb_each(to_jsonb(NEW)) n
     WHERE n.key <> 'updated_at'
       AND n.value IS DISTINCT FROM to_jsonb(OLD) -> n.key;
    source_value := NEW.data_source;
    customer_value := NEW.customer_id;
  ELSIF TG_OP = 'INSERT' THEN
    fields := ARRAY(SELECT key FROM jsonb_each(to_jsonb(NEW)) ORDER BY key);
    source_value := NEW.data_source;
    customer_value := NEW.customer_id;
  ELSE
    fields := ARRAY(SELECT key FROM jsonb_each(to_jsonb(OLD)) ORDER BY key);
    source_value := OLD.data_source;
    customer_value := OLD.customer_id;
  END IF;

  INSERT INTO customer_data_changes(customer_id, entity, action, changed_fields, source)
  VALUES (customer_value, TG_ARGV[0], lower(TG_OP), fields, source_value);
  RETURN coalesce(NEW, OLD);
END $$;--> statement-breakpoint

CREATE TRIGGER customer_profiles_track
  BEFORE INSERT OR UPDATE OR DELETE ON customer_profiles
  FOR EACH ROW EXECUTE FUNCTION app.track_customer_data_change('profile');--> statement-breakpoint
CREATE TRIGGER customer_preferences_track
  BEFORE INSERT OR UPDATE OR DELETE ON customer_fragrance_preferences
  FOR EACH ROW EXECUTE FUNCTION app.track_customer_data_change('preferences');--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.track_customer_note_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO customer_data_changes(customer_id, entity, action, changed_fields, source)
  VALUES (
    coalesce(NEW.customer_id, OLD.customer_id), 'preferred_note', lower(TG_OP),
    ARRAY['note_ar'], coalesce(NEW.data_source, OLD.data_source)
  );
  RETURN coalesce(NEW, OLD);
END $$;--> statement-breakpoint
CREATE TRIGGER customer_preferred_notes_track
  BEFORE INSERT OR DELETE ON customer_preferred_notes
  FOR EACH ROW EXECUTE FUNCTION app.track_customer_note_change();--> statement-breakpoint

-- Sessions may be linked once. Platform-driven erasure may clear the link.
CREATE OR REPLACE FUNCTION app.customer_session_link_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
  OR NEW.anonymous_id IS DISTINCT FROM OLD.anonymous_id
  OR NEW.channel IS DISTINCT FROM OLD.channel
  OR NEW.started_at IS DISTINCT FROM OLD.started_at
  OR NEW.retention_until IS DISTINCT FROM OLD.retention_until THEN
    RAISE EXCEPTION 'a customer data session may only be linked or erased';
  END IF;
  IF OLD.customer_id IS NULL AND NEW.customer_id IS NOT NULL AND OLD.linked_at IS NULL AND NEW.linked_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.customer_id IS NOT NULL AND NEW.customer_id IS NULL AND app.is_platform() THEN
    NEW.linked_at := NULL;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'a customer data session may be linked only once';
END $$;--> statement-breakpoint
CREATE TRIGGER customer_data_sessions_link_once
  BEFORE UPDATE ON customer_data_sessions
  FOR EACH ROW EXECUTE FUNCTION app.customer_session_link_guard();--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.link_customer_data_session(p_anonymous_id text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE linked_id uuid; signed_customer uuid;
BEGIN
  IF app.actor_role() <> 'customer' THEN
    RAISE EXCEPTION 'only a signed-in customer may link a customer data session';
  END IF;
  signed_customer := app.customer_id();
  IF signed_customer IS NULL THEN RAISE EXCEPTION 'customer identity is missing'; END IF;

  SELECT id INTO linked_id FROM customer_data_sessions
   WHERE anonymous_id = p_anonymous_id AND customer_id = signed_customer;
  IF linked_id IS NOT NULL THEN RETURN linked_id; END IF;

  UPDATE customer_data_sessions
     SET customer_id = signed_customer, linked_at = now()
   WHERE anonymous_id = p_anonymous_id
     AND (customer_id IS NULL OR customer_id = signed_customer)
  RETURNING id INTO linked_id;
  IF linked_id IS NULL THEN RAISE EXCEPTION 'session is missing or belongs to another customer'; END IF;
  RETURN linked_id;
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.validate_customer_behavior_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE session_customer uuid; session_channel customer_event_channel;
DECLARE product_brand uuid; product_seller uuid; order_customer uuid;
BEGIN
  SELECT customer_id, channel INTO session_customer, session_channel
    FROM customer_data_sessions WHERE id = NEW.session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer data session does not exist'; END IF;
  IF NEW.channel <> session_channel THEN RAISE EXCEPTION 'event channel must match session channel'; END IF;
  IF session_customer IS NOT NULL THEN
    IF NEW.customer_id IS NULL THEN NEW.customer_id := session_customer; END IF;
    IF NEW.customer_id <> session_customer THEN RAISE EXCEPTION 'event customer must match linked session customer'; END IF;
  ELSIF NEW.customer_id IS NOT NULL THEN
    RAISE EXCEPTION 'an identified event requires a linked session';
  END IF;

  IF NEW.product_id IS NOT NULL THEN
    SELECT brand_id, seller_id INTO product_brand, product_seller FROM products WHERE id = NEW.product_id;
    IF product_brand IS DISTINCT FROM NEW.brand_id OR product_seller IS DISTINCT FROM NEW.seller_id THEN
      RAISE EXCEPTION 'event product, brand and seller must describe the same listing';
    END IF;
  END IF;
  IF NEW.name IN ('product_viewed','wishlisted','cart_added','purchased','reviewed','returned','cancelled')
     AND NEW.product_id IS NULL THEN
    RAISE EXCEPTION 'event type % requires a product', NEW.name;
  END IF;
  IF NEW.name IN ('purchased','reviewed','returned','cancelled') THEN
    IF NEW.order_id IS NULL OR NEW.customer_id IS NULL THEN
      RAISE EXCEPTION 'post-order event type % requires order and customer', NEW.name;
    END IF;
    SELECT customer_id INTO order_customer FROM orders WHERE id = NEW.order_id;
    IF order_customer IS DISTINCT FROM NEW.customer_id THEN
      RAISE EXCEPTION 'event customer must own the referenced order';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM sub_orders so
      JOIN order_line_items li ON li.sub_order_id = so.id
      WHERE so.order_id = NEW.order_id AND so.seller_id = NEW.seller_id AND li.product_id = NEW.product_id
    ) THEN RAISE EXCEPTION 'event product and seller must belong to the referenced order'; END IF;
  ELSIF NEW.order_id IS NOT NULL THEN
    RAISE EXCEPTION 'pre-order events cannot reference an order';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER customer_behavior_events_validate
  BEFORE INSERT ON customer_behavior_events
  FOR EACH ROW EXECUTE FUNCTION app.validate_customer_behavior_event();--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.customer_data_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'customer_behavior_events'
     AND TG_OP = 'DELETE'
     AND app.is_platform()
     AND current_setting('app.retention_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$;--> statement-breakpoint
CREATE TRIGGER customer_behavior_events_append_only
  BEFORE UPDATE OR DELETE ON customer_behavior_events
  FOR EACH ROW EXECUTE FUNCTION app.customer_data_append_only();--> statement-breakpoint
CREATE TRIGGER customer_data_changes_append_only
  BEFORE UPDATE OR DELETE ON customer_data_changes
  FOR EACH ROW EXECUTE FUNCTION app.customer_data_append_only();--> statement-breakpoint
ALTER TABLE consent_records ADD CONSTRAINT consent_records_granted_boolean_text
  CHECK (granted IN ('true','false'));--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.purge_customer_behavior_events() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE removed bigint;
BEGIN
  IF NOT app.is_platform() THEN RAISE EXCEPTION 'customer event retention purge is a platform operation'; END IF;
  PERFORM set_config('app.retention_purge', 'on', true);
  DELETE FROM customer_behavior_events WHERE retention_until <= now();
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END $$;--> statement-breakpoint

-- RLS: personal attributes remain customer/platform only. Sellers receive only
-- activity explicitly scoped to their tenant; they never receive profiles.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customer_profiles','customer_fragrance_preferences','customer_preferred_notes',
    'customer_data_sessions','customer_behavior_events','customer_data_changes'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY platform_all ON %I FOR ALL USING (app.is_platform()) WITH CHECK (app.is_platform())', t);
  END LOOP;
END $$;--> statement-breakpoint

CREATE POLICY customer_manage_own_profile ON customer_profiles
  FOR ALL USING (customer_id = app.customer_id()) WITH CHECK (customer_id = app.customer_id());--> statement-breakpoint
CREATE POLICY customer_manage_own_preferences ON customer_fragrance_preferences
  FOR ALL USING (customer_id = app.customer_id()) WITH CHECK (customer_id = app.customer_id());--> statement-breakpoint
CREATE POLICY customer_manage_own_preferred_notes ON customer_preferred_notes
  FOR ALL USING (customer_id = app.customer_id()) WITH CHECK (customer_id = app.customer_id());--> statement-breakpoint
CREATE POLICY customer_read_own_data_sessions ON customer_data_sessions
  FOR SELECT USING (customer_id = app.customer_id());--> statement-breakpoint
CREATE POLICY customer_read_own_behavior_events ON customer_behavior_events
  FOR SELECT USING (
    customer_id = app.customer_id()
    OR EXISTS (
      SELECT 1 FROM customer_data_sessions s
      WHERE s.id = customer_behavior_events.session_id AND s.customer_id = app.customer_id()
    )
  );--> statement-breakpoint
CREATE POLICY customer_read_own_data_changes ON customer_data_changes
  FOR SELECT USING (customer_id = app.customer_id());--> statement-breakpoint
CREATE POLICY customer_record_own_data_changes ON customer_data_changes
  FOR INSERT WITH CHECK (customer_id = app.customer_id());--> statement-breakpoint
CREATE POLICY customer_link_unclaimed_data_session ON customer_data_sessions
  FOR UPDATE USING (customer_id IS NULL OR customer_id = app.customer_id())
  WITH CHECK (customer_id = app.customer_id());--> statement-breakpoint

CREATE POLICY analytics_create_customer_sessions ON customer_data_sessions
  FOR INSERT WITH CHECK (app.is_analytics() AND customer_id IS NULL AND linked_at IS NULL);--> statement-breakpoint
CREATE POLICY analytics_record_customer_events ON customer_behavior_events
  FOR INSERT WITH CHECK (app.is_analytics());--> statement-breakpoint
CREATE POLICY seller_read_own_customer_events ON customer_behavior_events
  FOR SELECT USING (seller_id = app.staff_seller_id());--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON
  customer_profiles, customer_fragrance_preferences, customer_preferred_notes,
  customer_data_sessions, customer_behavior_events, customer_data_changes
TO app_user;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON customer_data_changes FROM app_user;--> statement-breakpoint
REVOKE UPDATE, DELETE ON customer_data_sessions FROM app_user;--> statement-breakpoint
REVOKE UPDATE, DELETE ON customer_behavior_events FROM app_user;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.age_years(date) TO app_user;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.link_customer_data_session(text) TO app_user;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.purge_customer_behavior_events() TO app_user;
