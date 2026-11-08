# Seller backend refinements — local review

Owner: Codex. Reviewed work spans 7–8 November 2026.
Branch: codex/diyar-seller-workspace. No push, PR, deployment or live migration.

## Delivered capabilities

- Inventory uses physical on-hand product stock and a protected trigger-maintained reserved counter. Public catalogue/cart reads expose available quantity. Order-line creation reserves atomically; concurrent attempts cannot both reserve the last unit. Confirmation/dispatch also protects legacy open lines. Dispatch consumes physical units once. Cancellation/rejection releases active holds. Refusals/returns never silently restock; inspected goods require an explicit correction.
- The inventory journal is append-only and seller-isolated. API corrections require expected on-hand, a controlled reason and stable request ID; retries apply once, conflicting payloads fail. Existing listing stock edits are journaled and cannot undercut active holds. Runtime roles cannot call trigger-only helpers, forge reservations or change the reserved counter directly.
- Private customer leaderboard/profile: active brand owners see actual customer-provided names and completed purchases from their own house. Staff, revoked/ambiguous memberships and other actors are restricted. Underlying customer/parent-order table access remains unchanged. Profiles exclude contact details, demographics and other-house purchases. No public shoutout or marketing permission is inferred. Ranking is all-time completed-order frequency, excludes any return record conservatively, and is not net spending or customer profitability.
- Catalogue verified-photo reads are batched. Legacy mine retains its full array contract; opt-in minePage uses bounded keyset pages with exact SQL timestamp precision. Matching seller/update/id index is included. Existing callers are preserved.
- Refund facts are immutable and seller-isolated. Overlapping line/whole-parcel claims and excess cumulative recording are blocked. Identical refund retries acknowledge the first amount without another fact or audit entry. Historical recorded amounts remain unchanged. See REFUND_RECORDING.md for precise boundaries.

## Safe local migration sequence

1. Review source and security proposal; back up the intended database and rehearse restoration.
2. Rehearse 0042, 0043, 0044 in order on a disposable restored copy. Never edit previously applied migration files.
3. 0042 requires the controlled migration principal to own the narrowly checked customer capabilities and bypass forced RLS; app_user must never gain BYPASSRLS.
4. 0043 preserves stock and writes explicit cutover opening balances. It does not invent historical reservations. Review legacy open orders against physical counts; they acquire reservations on confirmation/dispatch and can fail for manual stock review. Existing completed history is unchanged. Initializing a new schema creates normal opening entries for new products.
5. 0044 imports existing refund amounts with historical_import provenance without recalculation. Invalid negative legacy facts stop the upgrade instead of being repaired silently.
6. Deploy the matching application only after the additive migrations. Keep checkout paused during an approved upgrade/reconciliation window. Verify one owner and one staff account, last-unit checkout, cancel/release, dispatch, adjustment replay and refund retry. This document is a future operational procedure, not evidence of a deployment.

## Deliberate remaining boundaries

- Inventory is product-level at one current stock location. Warehouses, variant-level stock, automatic timeout release and background scheduling remain separate work. No checkout timeout or business SLA was invented. Operators can cancel eligible orders through the established state flow to release holds.
- Historical inventory has no invented movement history; opening balances are explicitly cutover facts. On-hand is consumed at dispatch, not delivery. Goods in transit or returned goods do not become sellable automatically.
- Financial safeguards record operator refund decisions, not executed bank/gateway refunds. Quantity-level partial returns, component allocations, payment-provider execution/reconciliation and post-payout immutable adjustment postings remain unimplemented and require business-policy/provider decisions. The parent order's original discounted total is also an aggregate ceiling across sellers; no discount allocation is invented. Existing paid statements are not rewritten and the one-allocation safeguard stays intact.
- Customer names are customer-provided and can be missing. Current seller identity supports one active house per actor; ambiguous memberships fail closed. Ranking deliberately excludes even declined-return records for consistency with the existing overview definition.
- The legacy full-list catalogue endpoint remains unbounded for compatibility. Large new consumers should use minePage. Existing seller UI still loads the compatible list, now with batched photos.

## Verification

Focused domain, adapter, API and independent-connection PostgreSQL proofs cover stock holds, rollback, last-unit contention, correction replay, refund concurrency, tenant isolation, customer capability denial and exact pagination. Final command results are recorded in the completion response. No production/staging data was changed.

Final review corrected canonical product lock ordering for reversed carts and availability-aware in-stock filtering. Four real PostgreSQL inventory contention/rollback/replay cases and nine PGlite inventory cases passed. The original API integration file passed all 106 cases. The customer page/profile passed English/Arabic, six responsive layouts and main-content A/AA checks on synthetic demo data. Strict domain, database, API and web type checks passed. Financial discounted-order checks are recorded in REFUND_RECORDING.md.
