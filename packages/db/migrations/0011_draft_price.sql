-- =============================================================================
-- 0011 — A draft is allowed to have no price or size yet
--
-- `products_price_positive` (0001) requires `price_piastres > 0` in every state,
-- which is right for anything sellable and wrong for a listing a house has just
-- started. Creating one failed on the first statement, and the seller saw
-- "something went wrong" — the constraint was correct about products and had
-- never been asked about drafts.
--
-- The alternative was to demand a price at creation, alongside the name and the
-- path. That is a worse product: a house writing a listing knows what to call
-- it long before it knows what to charge, and a form that insists otherwise
-- gets a placeholder typed into it — which is the same zero, entered by hand
-- and now indistinguishable from a real decision.
--
-- So zero means "not decided yet", and it is only allowed while nobody can buy
-- it. THE MOMENT THE LISTING LEAVES `draft` the original rule applies again,
-- which makes this constraint strictly stronger than the one it replaces: it
-- also refuses a zero price on a suspended or archived listing, which the old
-- one permitted the instant a draft was moved.
--
-- `products_volume_positive` is the same rule about the same moment, and gets
-- the same treatment. A house that has not decided on 30ml or 50ml has not made
-- an error; it has an unfinished draft.
--
-- The domain says all of this in `listingGaps` — a price or a volume of zero is
-- `implausible` and blocks submission — so a house is told while they can fix
-- it, not by a constraint at the moment they press send.
-- =============================================================================

ALTER TABLE products DROP CONSTRAINT products_price_positive;--> statement-breakpoint
ALTER TABLE products DROP CONSTRAINT products_volume_positive;--> statement-breakpoint

/*
 * `= 0`, not "anything, if it is a draft".
 *
 * The first version read `price_piastres > 0 OR status = 'draft'`, which
 * permits MINUS four hundred pounds on a draft — the whole right-hand side is
 * satisfied by the status alone. Zero means undecided; anything below zero is
 * wrong in every state, and the comment above said so while the constraint
 * did not. Caught by the test written to assert the comment.
 */
ALTER TABLE products
  ADD CONSTRAINT products_price_positive
    CHECK (price_piastres > 0 OR (status = 'draft' AND price_piastres = 0)),
  ADD CONSTRAINT products_volume_positive
    CHECK (volume_ml > 0 OR (status = 'draft' AND volume_ml = 0));
