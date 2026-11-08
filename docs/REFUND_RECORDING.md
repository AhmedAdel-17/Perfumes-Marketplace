# Return and refund recording boundaries

Local backend refinement, 7 November 2026. No provider refund or bank transfer is executed by this work.

## Existing implementation

- `packages/api/src/routers/returns.ts` authenticates guest aftercare with order reference plus contact phone; seller decisions are seller-scoped; only platform staff can record a refund.
- `packages/domain/src/trust/return-request.ts` permits refund recording only after the return reaches `received`. The same case cannot be refunded twice through the domain state machine.
- `packages/domain/src/ports/return-repository.ts` and `packages/db/src/return-repository.ts` represent one return per purchased line. A line includes its entire purchased quantity. There is no selected return quantity or refund component allocation.
- Before this refinement, API validation bounded each recorded amount to 0–10,000,000 piastres, without checking the purchase amount or other cases. A conditional state update protected the same case but did not prevent concurrent duplicate cases for the same purchase.
- `packages/domain/src/services/settlement.ts`, `settlement-classify.ts`, and the unique sub-order allocation in `payout_lines` retain the existing settlement model. Refund recording is not automatically a settlement adjustment or post-payout reversal.

## Additive safeguards

- The return repository takes a transaction-scoped advisory lock for the authenticated parcel before rechecking claims. It does not widen the aftercare role's access to order lines. The database also rejects a new whole-parcel claim overlapping a line claim, a new line claim overlapping a whole-parcel claim, and a second claim for the same line. Existing claims are not deleted or rewritten.
- Migration `0044_return_refund_records.sql` adds one immutable refund fact per return ID. Fields identify the return, parcel, seller, optional line, integer amount, source, recording actor, observed source-decision timestamp, and recording timestamp. The table is a record of an operator decision, not evidence of provider execution.
- Existing non-null refund amounts are imported unchanged with source `historical_import`. The observed decision timestamp may reflect a subsequent closure; it is not asserted to be a payment execution timestamp. Malformed negative historical values stop migration for explicit review rather than being corrected silently.
- A new refund atomically updates the return, captures its immutable fact, and records the existing API audit entry in one Unit of Work. An identical API retry acknowledges the existing fact without another ledger or audit entry, including after a case is closed; a different amount or cost allocation cannot replace it. Ledger facts cannot be updated or deleted. Closing a case preserves the original fact.
- New cumulative recorded refunds across all sellers in one parent order cannot exceed its original `orders.total_piastres`, which already includes any order-level discount. A parent-order transaction lock serializes sibling-parcel refund checks. No discount allocation is inferred. Cumulative recorded refunds for each parcel also cannot exceed its snapshotted merchandise plus customer shipping charge. A line case cannot exceed that purchased line's snapshotted total plus the parcel shipping charge. These are generous anti-overpayment ceilings, not automatic entitlements or shipping allocations. The existing undifferentiated amount remains unchanged; no new shipping rule is invented.
- Existing amounts above these ceilings remain historical facts. They consume the cumulative budget and require reviewed correction outside this workflow; the migration does not invent balancing entries.
- Platform staff and the matching seller owner can read refund facts. Fulfilment staff, another seller, anonymous users, and aftercare cannot read the ledger. Only platform recording can append a matching fact. No customer contact data is duplicated into this table.

## Remaining decisions and capabilities

1. **Quantity-level partial returns:** define units requested, approved, received, inspected, and refunded, including repeat requests for different units from one purchased line. Current partial monetary refunds do not prove which units were returned. Do not unlock repeated line claims until this exists.
2. **Refund breakdown and allocation:** define merchandise, discounts, outbound shipping, return shipping and fees; allocate order-level discounts deterministically across units. Preserve historical line and commission snapshots. The new ceilings cannot substitute for these policies.
3. **Execution and reconciliation:** provider-specific refund operations need durable idempotency keys, gateway references, pending/succeeded/failed states, webhook deduplication and reconciliation against captured or collected funds. COD requires evidence of how money was returned. Recorded status alone is not that evidence.
4. **Settlement accounting:** agree the commission reversal, shipping treatment and seller adjustment for partial returns and for refunds after a payout allocation. Add explicit immutable postings referencing the original allocation; never overwrite a paid historical statement. The existing one-allocation guard must not simply be removed.
5. **Operational approval:** confirm who may authorize goodwill/refund components and exceptions. This refinement adds no new rate, reserve, settlement schedule, approval threshold or customer-policy choice.

## Focused verification

`refund-records.test.ts` covers immutability, paid-value ceilings, overlap, role restrictions and unchanged payouts. The shared return contract and API aftercare tests cover stale refund retries preserving the first amount. `transition-concurrency.test.ts` uses two independent PostgreSQL sessions to prove competing requests cannot create a second refundable case. PostgreSQL concurrency proof is separate from PGlite tests, which serialize execution.
