-- =============================================================================
-- 0036 — One more browsing event: a visitor opened the scent map
--        (La Carte olfactive — founder, 19–20 Oct 2026; ANALYTICS_DEFINITIONS §2b)
--
-- The scent map draws the whole catalogue as a night sky (/scent-map). Whether
-- it sends anyone on to a perfume is the measured question, set before it
-- ships (CLAUDE.md §10): of the visitors who opened the map, the share whose
-- next product view in the visit came after it. The event carries no perfume —
-- the map is the whole catalogue — and, like every other, no payload, no
-- customer and no source; 0023's refusals stand exactly as written. Only the
-- list of names grows, so the policy is replaced with the same body and one
-- name more.
--
-- rollback: re-create `analytics_insert_events` from 0034 (without
-- 'scent_map_view'), then delete rows named 'scent_map_view'.
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
      'product_view', 'reveal_open', 'dial_turn', 'cart_add', 'checkout_start'
    )
  );
