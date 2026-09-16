-- =============================================================================
-- 0023 — the analytics service role, and what a browsing event may contain
--
-- WHAT THIS FIXES. `analytics_events` has existed since 0000 and NOTHING HAS
-- EVER WRITTEN TO IT: 0002 enables and forces row-level security on it and gives
-- it exactly one policy, `platform_all`. So the pre-order half of the funnel —
-- who looked at a perfume, who put one in a bag and stopped — had no answer, and
-- `docs/ANALYTICS_DEFINITIONS.md` §2b showed it as *not yet recorded* rather
-- than inventing it. Founder decision A-1 (15 Sep 2026) is to record it.
--
-- WHY A FOURTH SERVICE ROLE. `checkout` places orders, `aftercare` handles what
-- follows delivery, `intake` admits an application. A page view is none of those
-- and happens for a visitor who is nobody at all. Folding it into one of them
-- would widen a role whose entire justification is how little it can do — and
-- this is the one role a bug could point at every visitor on the site.
--
-- THE PRIVACY RULES ARE IN THE WITH CHECK, NOT IN THE ROUTER. A-1's condition
-- was "no personal data in the event". That is not a promise the application
-- makes here; it is a row the database refuses:
--
--   * `customer_id` must be NULL — the trail is never joined to a person, not
--     even a signed-in one;
--   * `payload` must be NULL — the first thing anybody would put there is the
--     search text, which is typed by a person and can carry a name, a phone
--     number or an address into a table nobody thinks of as personal data. A
--     search is COUNTED; the words are not recorded;
--   * `source` and `campaign_id` must be NULL — attribution is already recorded
--     per sub-order at order time (`attribution_touches`), and that is the record
--     commission is computed from. A second, weaker copy would eventually
--     disagree with the money;
--   * `order_id` must be NULL — an order is not a browsing event;
--   * `anonymous_id` must be 24 hex characters, so nothing else can be "reused"
--     as an identifier in that column;
--   * `name` must be one of the seven pre-order events this site actually fires
--     (doc 04 §6). An unknown name is refused rather than stored: a typo would
--     otherwise become a silent gap in a funnel, where the count is merely low
--     and nothing says why.
--
-- NO SELECT POLICY, deliberately. The shop writes and never reads: the owner's
-- report reads as `platform`. `record()` does not use INSERT … RETURNING, so the
-- SELECT-on-returning trap that 0003, 0015 and 0018 each hit does not apply —
-- and if a future caller adds RETURNING, it fails loudly here rather than
-- quietly handing a visitor's row back to the page they are on.
-- =============================================================================

/** True inside an analytics write, and nowhere else. */
CREATE OR REPLACE FUNCTION app.is_analytics() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT app.actor_role() = 'analytics' $$;--> statement-breakpoint

CREATE POLICY analytics_insert_events ON analytics_events
  FOR INSERT WITH CHECK (
    app.is_analytics()
    AND customer_id IS NULL
    AND payload IS NULL
    AND source IS NULL
    AND campaign_id IS NULL
    AND order_id IS NULL
    AND anonymous_id ~ '^[0-9a-f]{24}$'
    AND name IN (
      'landing_view', 'storefront_view', 'search', 'filter_apply',
      'product_view', 'cart_add', 'checkout_start'
    )
  );--> statement-breakpoint

-- =============================================================================
-- Retention (A-1, proposed 16 Sep 2026: 180 days)
--
-- PDPL 151/2020 requires a retention rule as well as a lawful basis. A trail
-- nobody deletes outlives its purpose, which is the thing a retention rule
-- exists to prevent.
--
-- SECURITY DEFINER so the sweep can delete rows the caller's policies would not
-- let it touch — and therefore guarded on the first line, because EXECUTE is
-- granted to PUBLIC by default and every actor on this system connects as the
-- same database role. The guard is the actor GUC, exactly as the policies are.
--
-- NOTHING SCHEDULES THIS YET. There is no scheduler in this system, so the
-- function is written, tested, and recorded as DEBT_REGISTER #5 rather than
-- left as a comment saying somebody should write it.
-- =============================================================================
CREATE OR REPLACE FUNCTION app.purge_analytics_events(older_than_days integer)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE removed bigint;
BEGIN
  IF NOT app.is_platform() THEN
    RAISE EXCEPTION 'purge_analytics_events is a platform operation';
  END IF;
  IF older_than_days IS NULL OR older_than_days < 1 THEN
    -- A zero or negative window would delete everything including today's
    -- events, which is a different operation wearing this one's name.
    RAISE EXCEPTION 'older_than_days must be at least 1';
  END IF;

  DELETE FROM analytics_events
   WHERE occurred_at < now() - make_interval(days => older_than_days);
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END $$;--> statement-breakpoint

COMMENT ON FUNCTION app.purge_analytics_events(integer) IS
  'Deletes browsing events older than N days (A-1 retention). Platform only. Nothing schedules it yet — DEBT_REGISTER #5.';
