-- =============================================================================
-- 0034 — One more browsing event: a visitor turned a perfume's day-on-the-skin
--        dial (La Durée — founder, 19–20 Oct 2026; ANALYTICS_DEFINITIONS §2b)
--
-- The dial replaced the "evolution" chart on the product page: the visitor
-- turns its hand, or presses "spray" to watch the day pass. Whether it helps a
-- visitor decide is a measured question, set before it ships (CLAUDE.md §10):
-- of the visitors who turned a perfume's dial, how many then put THAT perfume
-- in a bag — against the same rate for visitors who viewed the perfume and
-- left the dial alone. Recorded once per page view, on the first turn.
--
-- Nothing else about what an event may carry changes: the event names its
-- perfume and its house, under the anonymous id, with no payload, no customer
-- and no source — 0023's refusals stand exactly as written. Only the list of
-- names grows, so the policy is replaced with the same body and one name more.
--
-- rollback: re-create `analytics_insert_events` from 0033 (without
-- 'dial_turn'), then delete rows named 'dial_turn'.
-- =============================================================================

DROP POLICY analytics_insert_events ON analytics_events;--> statement-breakpoint

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
      'product_view', 'reveal_open', 'dial_turn', 'cart_add', 'checkout_start'
    )
  );
