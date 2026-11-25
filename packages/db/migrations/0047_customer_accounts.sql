-- Additive customer sign-in; previous financial migrations and snapshots are untouched.
ALTER TABLE sessions DROP CONSTRAINT sessions_audience_known;
ALTER TABLE sessions ADD CONSTRAINT sessions_audience_known CHECK(audience IN ('seller','platform','customer'));
ALTER TABLE login_codes DROP CONSTRAINT login_codes_audience_known;
ALTER TABLE login_codes ADD CONSTRAINT login_codes_audience_known CHECK(audience IN ('seller','platform','customer'));
CREATE UNIQUE INDEX customers_auth_user_unique ON customers(auth_user_id) WHERE auth_user_id IS NOT NULL;
-- Only the server's OTP-verified identity adapter can claim an existing phone.
CREATE POLICY identity_read_customers ON customers FOR SELECT USING(app.is_identity());
CREATE POLICY identity_insert_customers ON customers FOR INSERT WITH CHECK(app.is_identity());
CREATE POLICY identity_claim_customers ON customers FOR UPDATE USING(app.is_identity()) WITH CHECK(app.is_identity());
CREATE FUNCTION app.guard_customer_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.phone IS DISTINCT FROM OLD.phone OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id OR NEW.claimed_at IS DISTINCT FROM OLD.claimed_at) AND NOT app.is_identity() THEN
  RAISE EXCEPTION 'customer identity is managed by verified sign-in';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_customer_identity BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION app.guard_customer_identity();
CREATE TABLE customer_profiles (
 customer_id uuid PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
 date_of_birth date NOT NULL CHECK(date_of_birth >= DATE '1900-01-01' AND date_of_birth <= CURRENT_DATE),
 gender text NOT NULL CHECK(gender IN ('female','male','other')),
 families text[] NOT NULL DEFAULT '{}' CHECK(families <@ ARRAY['fresh','floral','woody','amber','spicy','gourmand','musk','citrus']::text[] AND cardinality(families)<=8),
 notes text[] NOT NULL DEFAULT '{}' CHECK(cardinality(notes)<=30 AND length(array_to_string(notes,','))<=1500),
 occasions text[] NOT NULL DEFAULT '{}' CHECK(occasions <@ ARRAY['everyday','work','evening','special']::text[] AND cardinality(occasions)<=4),
 seasons text[] NOT NULL DEFAULT '{}' CHECK(seasons <@ ARRAY['spring','summer','autumn','winter']::text[] AND cardinality(seasons)<=4),
 concentrations text[] NOT NULL DEFAULT '{}' CHECK(concentrations <@ ARRAY['edt','edp','extrait','oil']::text[] AND cardinality(concentrations)<=4),
 bottle_sizes integer[] NOT NULL DEFAULT '{}' CHECK(cardinality(bottle_sizes)<=10 AND 0<ALL(bottle_sizes) AND 2000>=ALL(bottle_sizes)),
 budget_min_piastres integer CHECK(budget_min_piastres>=0),budget_max_piastres integer CHECK(budget_max_piastres>=0),
 CHECK(budget_min_piastres IS NULL OR budget_max_piastres IS NULL OR budget_min_piastres<=budget_max_piastres),
 personalization_consent boolean NOT NULL DEFAULT false,marketing_consent boolean NOT NULL DEFAULT false,
 collected_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),source text NOT NULL DEFAULT 'customer_account' CHECK(source='customer_account')
);
CREATE TABLE customer_profile_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,snapshot jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX customer_profile_history_customer_time ON customer_profile_history(customer_id,recorded_at);
CREATE FUNCTION app.record_customer_profile_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN INSERT INTO customer_profile_history(customer_id,snapshot) VALUES(NEW.customer_id,to_jsonb(NEW));RETURN NEW;END $$;
CREATE TRIGGER record_customer_profile_history AFTER INSERT OR UPDATE ON customer_profiles FOR EACH ROW EXECUTE FUNCTION app.record_customer_profile_history();
ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;ALTER TABLE customer_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE customer_profile_history ENABLE ROW LEVEL SECURITY;ALTER TABLE customer_profile_history FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON customer_profiles,customer_profile_history TO app_user;
CREATE POLICY customer_profile_read ON customer_profiles FOR SELECT USING(app.actor_role()='customer' AND customer_id=app.customer_id());
CREATE POLICY customer_profile_insert ON customer_profiles FOR INSERT WITH CHECK(app.actor_role()='customer' AND customer_id=app.customer_id());
CREATE POLICY customer_profile_update ON customer_profiles FOR UPDATE USING(app.actor_role()='customer' AND customer_id=app.customer_id()) WITH CHECK(app.actor_role()='customer' AND customer_id=app.customer_id());
CREATE POLICY customer_history_read ON customer_profile_history FOR SELECT USING(app.actor_role()='customer' AND customer_id=app.customer_id());
-- Append via the profile trigger, never update/delete or read by sellers.
CREATE POLICY customer_history_append ON customer_profile_history FOR INSERT WITH CHECK(app.actor_role()='customer' AND customer_id=app.customer_id());
CREATE INDEX orders_customer_history_idx ON orders(customer_id,placed_at DESC);

-- A seller session must never inherit customer access even if a UUID is shared.
CREATE OR REPLACE FUNCTION app.customer_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT id FROM public.customers WHERE app.actor_role()='customer' AND auth_user_id=app.actor_id() LIMIT 1
$$;
