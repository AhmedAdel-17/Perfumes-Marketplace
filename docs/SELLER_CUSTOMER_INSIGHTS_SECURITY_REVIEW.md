# Private brand customer leaderboard and profile: security review

7 November 2026. Status: implemented in LOCAL source for focused disposable-fixture verification. No live/staging migration, deployment, remote write or public customer sharing is authorized.

## Authorized scope

The founder explicitly requested a private Brand A leaderboard showing its top customers with their actual names and profiles, visible to the brand owner. This supersedes the earlier pseudonym-only proposal. The revised scoped source write passed automatic approval review; that does not replace security tests or deployment approval.

`customers.full_name` is the only customer-profile attribute returned. We group by stable `orders.customer_id`, never by recipient name/phone. A scoped opaque reference links to a private profile containing the same name, included completed count/date range and at most 50 own-house completed suborder references/delivery dates. Names can be NULL; do not fabricate them from shipping details.

No phone, email, DOB, gender, address, raw customer UUID, cross-house order, platform-wide history, social handle or campaign data is exposed. No permission to publish a shoutout or contact a customer is inferred. These named private insights are personal data, not anonymous analytics.

## Preserved boundary and exact capability

`0002_rls.sql` deliberately grants sellers no read policy on parent orders or customers. That boundary remains: no table RLS changes or parent/customer table grants. The ordinary runtime role remains `app_user`.

Two SECURITY DEFINER functions expose bounded projections only. They check actor_role=seller, a non-null actor, exactly ONE current unrevoked staff membership, and owner status for that precise house before reading purchase/customer facts. Ambiguous multi-house memberships fail restricted rather than choosing a house. Manager, fulfilment, viewer, revoked owner, anonymous, customer, identity-service and platform actors are restricted; empty authorized houses are owner/empty, a distinct result.

The fixed search path is pg_catalog, with all data tables schema-qualified. Do not call the legacy staff_seller_id helper inside this restricted path: its body uses an unqualified table. The new functions independently query qualified staff rows and do not alter existing identity/RLS helpers.

The controlled function owner must already be a privileged migration role capable of bypassing FORCE RLS. Never grant BYPASSRLS or SUPERUSER to app_user. row_security=off makes misconfigured ownership fail loudly, rather than returning incomplete rankings. Only app_user receives EXECUTE; PUBLIC execution is revoked for both signatures. The functions use static SQL and bounded typed inputs, with no seller/raw-customer selector.

## Definitions and privacy limits

Ranking is all-time count of own suborders currently delivered, with a recorded delivery timestamp no later than the database clock, excluding ANY recorded return (including declined/closed cases conservatively). It is not net spending, revenue, a payout balance or a guaranteed eligibility rule for giveaways. Top-N limits output, not total aggregation work.

Profiles use the identical purchase eligibility definition; unknown and other-seller references both produce owner/profile:null. No profile lookup returns other brand activity. The reference is C- plus 128 bits of a SHA-256 hash over random seller/customer UUIDs. It differs across sellers, but is pseudonymous personal data and can be linked by privileged platform administrators. No pgcrypto extension is required; PostgreSQL built-in SHA-256 is used.

Existing indexes on seller/state, parent order PK and returns suborder support the aggregate. Inspect a representative nonproduction plan before enabling this for large sellers; do not add speculative indexes or a broad customer query.

The application adapter normalizes PGlite object/rows and postgres-js array results, validates the aggregate, safe integer counts and timestamps, and maps an explicit output allowlist. Missing/malformed results are errors, never false zeros. API validators reject extra selectors and excessive limits; current owner capability is rechecked by SQL on every request.

## Focused verification

- `packages/db/src/seller-customer-read-model.test.ts`: real forced-RLS disposable PGlite fixture; separate owners/counts, same buyer different seller references, actual names despite shared recipient identity, private completed profile history, return-status/date/state exclusions, nonowner and other-role rejection, revocation, empty-owner distinction, unchanged parent/customer RLS denial, limits, PUBLIC revoke, fixed path and incorrect-owner failure.
- `packages/db/src/seller-customer-read-model-driver.test.ts`: both supported driver shapes, profile allowlists, explicit restriction and malformed/unsafe-count/date failures.
- `packages/api/src/seller-customers.test.ts`: strict input and role guards, actual-name allowlist, own-profile response shape and removal of unapproved profile/contact fields.

These checks do not authorize production data changes or public customer recognition. They must pass before reporting the feature ready for local review.

## Disable / rollback

Revoke EXECUTE for app_user on both exact signatures to disable the capability. Drop the two functions to remove it; no historical order/customer/financial data needs modification. Follow forward-only migration policy for an environment where it has been applied. The API must surface restriction/unavailability, never pretend customer counts are zero. Deployment remains separately authorized.

## Exact local migration source

```sql
-- 0042 — explicitly authorized private brand-owner customer frequency/profile.
-- Pattern: capability-limited SECURITY DEFINER read model. Existing parent and
-- customer RLS policies/table grants remain untouched. Actual customer.full_name
-- is the ONLY profile attribute exposed; never infer identity from a recipient.
-- Both endpoints recheck the current active owner and derive the seller. No
-- seller selector or raw customer ID is accepted. Pseudonyms remain private
-- personal data. No public shoutout/outreach consent is inferred or changed.
-- The controlled migration owner must already bypass FORCE RLS. row_security
-- off fails loudly if that owner is misconfigured; never grant bypass to app_user.
-- All-time own delivered suborders, nonfuture recorded delivery, ANY return
-- record conservatively excluded. This is frequency, not net spend/settlement.

CREATE FUNCTION app.seller_customer_leaderboard(p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog SET row_security = off
AS $$
DECLARE v_seller uuid; v_customers jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'Invalid leaderboard limit' USING ERRCODE = '22023';
  END IF;
  IF app.actor_role() <> 'seller' OR app.actor_id() IS NULL THEN
    RETURN jsonb_build_object('access', 'restricted');
  END IF;
  -- The existing portal supports one active house per actor. Ambiguous
  -- multi-house memberships fail closed instead of choosing a house by LIMIT.
  IF (SELECT count(*) FROM public.seller_staff st
      WHERE st.auth_user_id = app.actor_id() AND st.revoked_at IS NULL) <> 1 THEN
    RETURN jsonb_build_object('access', 'restricted');
  END IF;
  SELECT st.seller_id INTO v_seller FROM public.seller_staff st
    WHERE st.auth_user_id = app.actor_id() AND st.revoked_at IS NULL;
  IF v_seller IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.seller_staff st WHERE st.seller_id = v_seller
      AND st.auth_user_id = app.actor_id() AND st.role = 'owner'
      AND st.revoked_at IS NULL
  ) THEN RETURN jsonb_build_object('access', 'restricted'); END IF;

  WITH eligible AS (
    SELECT o.customer_id, c.full_name, s.delivered_at
    FROM public.sub_orders s JOIN public.orders o ON o.id = s.order_id
    JOIN public.customers c ON c.id = o.customer_id
    WHERE s.seller_id = v_seller AND s.state = 'delivered'
      AND s.delivered_at IS NOT NULL AND s.delivered_at <= CURRENT_TIMESTAMP
      AND NOT EXISTS (SELECT 1 FROM public.returns r WHERE r.sub_order_id = s.id)
  ), ranked AS (
    SELECT 'C-' || substr(encode(sha256(convert_to(
      v_seller::text || ':' || customer_id::text, 'UTF8')), 'hex'), 1, 32) AS customer_ref,
      full_name, count(*) AS completed_orders, min(delivered_at) AS first_at,
      max(delivered_at) AS last_at
    FROM eligible GROUP BY customer_id, full_name
    ORDER BY completed_orders DESC, last_at DESC, customer_ref ASC LIMIT p_limit
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'customerRef', customer_ref, 'fullName', full_name,
    'completedOrders', completed_orders::text,
    'firstDeliveredAt', first_at, 'lastDeliveredAt', last_at
  ) ORDER BY completed_orders DESC, last_at DESC, customer_ref ASC), '[]'::jsonb)
  INTO v_customers FROM ranked;
  RETURN jsonb_build_object('access', 'owner', 'customers', v_customers);
END;
$$;
REVOKE ALL ON FUNCTION app.seller_customer_leaderboard(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.seller_customer_leaderboard(integer) TO app_user;

CREATE FUNCTION app.seller_customer_profile(p_reference text, p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog SET row_security = off
AS $$
DECLARE v_seller uuid; v_profile jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'Invalid customer profile limit' USING ERRCODE = '22023';
  END IF;
  IF app.actor_role() <> 'seller' OR app.actor_id() IS NULL THEN
    RETURN jsonb_build_object('access', 'restricted');
  END IF;
  -- The existing portal supports one active house per actor. Ambiguous
  -- multi-house memberships fail closed instead of choosing a house by LIMIT.
  IF (SELECT count(*) FROM public.seller_staff st
      WHERE st.auth_user_id = app.actor_id() AND st.revoked_at IS NULL) <> 1 THEN
    RETURN jsonb_build_object('access', 'restricted');
  END IF;
  SELECT st.seller_id INTO v_seller FROM public.seller_staff st
    WHERE st.auth_user_id = app.actor_id() AND st.revoked_at IS NULL;
  IF v_seller IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.seller_staff st WHERE st.seller_id = v_seller
      AND st.auth_user_id = app.actor_id() AND st.role = 'owner'
      AND st.revoked_at IS NULL
  ) THEN RETURN jsonb_build_object('access', 'restricted'); END IF;
  IF p_reference IS NULL OR p_reference !~ '^C-[a-f0-9]{32}$' THEN
    RETURN jsonb_build_object('access', 'owner', 'profile', NULL);
  END IF;

  WITH eligible AS (
    SELECT c.full_name, s.reference, s.delivered_at
    FROM public.sub_orders s JOIN public.orders o ON o.id = s.order_id
    JOIN public.customers c ON c.id = o.customer_id
    WHERE s.seller_id = v_seller AND s.state = 'delivered'
      AND s.delivered_at IS NOT NULL AND s.delivered_at <= CURRENT_TIMESTAMP
      AND NOT EXISTS (SELECT 1 FROM public.returns r WHERE r.sub_order_id = s.id)
      AND 'C-' || substr(encode(sha256(convert_to(
        v_seller::text || ':' || o.customer_id::text, 'UTF8')), 'hex'), 1, 32) = p_reference
  ), recent AS (
    SELECT reference, delivered_at FROM eligible
    ORDER BY delivered_at DESC, reference ASC LIMIT p_limit
  )
  SELECT CASE WHEN count(*) = 0 THEN NULL ELSE jsonb_build_object(
    'customerRef', p_reference, 'fullName', min(full_name),
    'completedOrders', count(*)::text, 'firstDeliveredAt', min(delivered_at),
    'lastDeliveredAt', max(delivered_at),
    'orders', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'reference', reference, 'deliveredAt', delivered_at
    ) ORDER BY delivered_at DESC, reference ASC), '[]'::jsonb) FROM recent)
  ) END INTO v_profile FROM eligible;
  RETURN jsonb_build_object('access', 'owner', 'profile', v_profile);
END;
$$;
REVOKE ALL ON FUNCTION app.seller_customer_profile(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.seller_customer_profile(text, integer) TO app_user;


```
