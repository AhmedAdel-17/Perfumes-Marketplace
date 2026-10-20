-- =============================================================================
-- 0037 — Two more browsing events: the reveal as the way into a perfume's page
--        (Le Dévoilement — founder, 20 Oct 2026; ANALYTICS_DEFINITIONS §2b)
--
-- The first time a perfume is opened in a visit, from a card, its reveal now
-- plays as the passage to its page, and any press goes straight on. Whether
-- visitors watch it or press through is the measured question, set before it
-- ships (CLAUDE.md §10): `reveal_arrive` when it plays, `reveal_skip` when the
-- visitor cuts it short, both carrying the perfume. A reveal played without
-- being asked for is not a `reveal_open` — that one stays the visitor's own
-- choice on the perfume's page, or its uptake number would count every card
-- press. Like every other event: no payload, no customer and no source; 0023's
-- refusals stand exactly as written. Only the list of names grows, so the
-- policy is replaced with the same body and two names more.
--
-- rollback: re-create `analytics_insert_events` from 0036 (without
-- 'reveal_arrive' and 'reveal_skip'), then delete rows with those names.
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
      'landing_view', 'storefront_view', 'search', 'filter_apply', 'scent_map_view',
      'product_view', 'reveal_open', 'reveal_arrive', 'reveal_skip', 'dial_turn',
      'cart_add', 'checkout_start'
    )
  );
