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

