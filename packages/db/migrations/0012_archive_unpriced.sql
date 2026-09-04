-- =============================================================================
-- 0012 — An abandoned draft can be thrown away
--
-- 0011 let a draft carry no price, and required one the moment it left `draft`.
-- That is right for every destination except the one that means "I am not doing
-- this after all": archiving an unpriced draft was refused, so a house that
-- started a listing and changed its mind had no way to clear it off the list.
--
-- The rule should have been about who can SEE it, not about which state it is
-- in. A price is required from the moment the listing is in front of anyone
-- other than its own house — the moderation queue, the shopfront, or a
-- suspension somebody has to review. `draft` and `archived` are both private,
-- and neither needs one.
--
-- A new migration rather than an edit to 0011, even though nothing is deployed:
-- `applyMigrations` records what it has run, so editing an applied file would
-- change the repository and leave every existing database on the old rule —
-- which is the exact failure mode a migration ledger exists to prevent.
-- =============================================================================

ALTER TABLE products DROP CONSTRAINT products_price_positive;--> statement-breakpoint
ALTER TABLE products DROP CONSTRAINT products_volume_positive;--> statement-breakpoint

ALTER TABLE products
  ADD CONSTRAINT products_price_positive
    CHECK (price_piastres > 0
           OR (price_piastres = 0 AND status IN ('draft', 'archived'))),
  ADD CONSTRAINT products_volume_positive
    CHECK (volume_ml > 0
           OR (volume_ml = 0 AND status IN ('draft', 'archived')));
