# DIYAR — safe phased evolution plan

18 October 2026. **Design only. No migrations or data changes run.** Approval of this report would approve a direction, not authorize immediate deployment. Implementation still requires the user's subsequent explicit instruction and recorded decisions. Do not infer that all of `03_TARGET_ERD_RECONCILED.mmd` belongs in one release.

## 1. Preservation contract

Keep one shared PostgreSQL database, seller tenancy, existing Drizzle/domain/API boundaries, IDs, URLs, bilingual functionality, public storefronts, guest checkout and manual fulfilment. Do not replace `products`, `orders`, `sub_orders`, `order_line_items`, `payouts`, `payout_lines` or the migration history. Existing statements and purchase snapshots are evidence; never recompute them from today's price, brand name, fee, reserve or return policy.

All new state starts additive and nullable where compatibility requires it. Backfill only from evidence with a recorded provenance/reconciliation run. Distinguish `legacy_unknown`/unverified from zero, paid, captured, verified or attributed. No historical transaction is silently marked settled because a payout statement exists. No old refund is assumed paid because a return case has a number.

Use small domain services behind ports, typed commands, Unit of Work transactions, explicit state machines, idempotent external adapters and an outbox. Name the chosen pattern in future module headers per engineering rules. Domain remains framework-free. Existing UI/API facades evolve through these services; no separate backend or message broker is needed now.

## 2. Stage 0 — decisions, safe environment and release evidence (no business-table redesign)

**Depends on:** founder review of findings, canonical register updates by authorized owners, explicit implementation authorization. Existing `MASTER_EXECUTION_PLAN.md` P0.2.5/P0.2.6 and DR-15 are not bypassed by this audit. The order of future tasks must be recorded; do not modify historical COMPLETE entries.

1. Restore a real git checkout/known revision and baseline all source/SQL. This supplied copy has no git metadata. Compare deployed catalogs, installed migrations, roles and row volumes on an explicitly authorized sanitized clone. Do not connect with production credentials for convenience.
2. Confirm tenant/private-field and permission matrix, D-5 cash owner/invoice vs payout, D-4 fee/rounding, DR-02 attribution, customer possession/return/stock policies, scheduler choice, retention and recovery objectives. Report 07 lists exact questions.
3. Reconcile migration tooling: 32 ordered SQL files versus Drizzle journal containing only 0000; document one release runner. Add a migration lock, checksums and an atomic schema-change/marker strategy. State exceptions for concurrent indexes. Keep history intact. Fix best-effort silent seal behavior before relying on it.
4. Establish nonowner/non-BYPASS runtime and reporting identities, trusted definer ownership, least schema/function grants and no client SQL credential. Test them on server PostgreSQL, not solely a privileged in-memory fixture.
5. Record a successful backup restoration, constraints/policy counts, migration version, media-reference behavior and financial reconciliation. Use synthetic data to exercise critical flows. Install dependencies later only under an implementation/testing authorization; none were installed for this audit.

**Gate:** source/deployed drift understood, rollback build identified, restore reproducible, named owners and decisions. Freeze software payouts throughout stages 0–5. An environment override is not an approval process.

## 3. Stage 1 — tenant/authority and public-data hardening

**Keep:** current role/session architecture and working private-contact split. **Modify:** F09/F10/F16/F17/F20 boundaries with explicit role checks and database invariants.

- Validate that a new listing's brand belongs to the authenticated seller under current policy. Add the appropriate seller-consistent unique/FK or guarded-write invariant, with an initial scan for conflicting rows. If multi-seller brand permissions are later approved, replace ownership test with a reviewed authorization link; do not invent that permission today.
- Freeze COD collection/remittance, proof and finance-controlled fields for seller writes at the SQL boundary, and ensure normal seller dispatch still works. Narrow sub-order/customer return mutations to approved fields/actors. Preserve operator workflow while adding explicit finance authority before money approval.
- Populate existing `product_revisions` on material catalogue/price/stock changes in the same transaction, with actor and before/after evidence. It is currently a protected schema shell, not a working history feed (F22); do not add a parallel price-history store.
- Separate public storefront facts from private owner/application/escalation/financial fields. Prefer explicit public read models backed by least grants or private side tables; move sensitive values additively, dual-read during transition, verify projections then remove old exposure in a later release. Keep existing public contact isolation tests.
- Authenticate a named seller staff member rather than arbitrary first staff on a shared contact number. Carry explicit active tenant and permission semantics through session, context and SQL helpers. Do not silently choose the role policy: introduce a distinct decision ID because existing S-1 references conflict.
- Pin/qualify SECURITY DEFINER dependencies and restrict execution/schema creation; prove no untrusted object substitution. Check real runtime role membership, SQL injection blast radius and pooler reuse.
- Protect served CMS content without exposing drafts; add both-language image visibility and same-page revision-pointer validation.

**Backfill:** no automatic principal reassignment. Produce a report of ambiguous phone/auth-user memberships; operations verifies ownership. Treat private-field movement as a privacy-sensitive migration with before/after access proofs.

**Gate:** T01/T07/T11/T15 pass on direct SQL roles and API actions. No known seller can alter another seller's graph or certify its own cash; public canary private fields never appear. Current storefronts/sign-in/dispatch remain functional.

## 4. Stage 2 — retry-safe order commands and complete operational outcomes

Align with existing P1.2.1–P1.2.4, adding explicit acceptance scope for F03/F21.

### Checkout command

Add `checkout_requests` with unique **(authenticated-or-guest scope, request_key)**, normalized payload hash, accepted quote/version, durable state/result/order reference and timestamps/expiry. Never make scope unique alone; never accept a browser's arbitrary monetary total as pricing authority. Same key/hash returns the original committed result; same key/different normalized intent fails. Choose a guest scope with adequate entropy and privacy retention; a phone alone is not a secure credential.

Normalize duplicate product IDs before pricing and stock evaluation, with a cap on aggregate quantity. A summary quote captures accepted unit prices, shipping, arrangement, preparation promises and expiry; the server revalidates it, then refuses changed economics until the buyer acknowledges. A quote is a signed/DB-backed assertion or version, not a client-supplied price.

For combined fulfilment, preparation must account for every line rather than the first line in the input. Record the accepted fee/ETA/SLA/return policy and terms version. Do not mutate an order's promise because current seller settings changed.

### State commands

Lock the target row or use expected-state/version compare-and-set with affected-row checks. Validate actor/reason and insert transition facts exactly once with a unique command/event identity in the same transaction. Choose a consistent locking order across seller/product/sub-order rows to avoid deadlocks; retry serialization/deadlock failures with the same command key and bounded attempts.

Add cancel/refuse/delivery-attempt commands, precise reason codes and cost-owner snapshots. A refusal is an operational outcome, not proof of refunded/returned cash. Do not change a whole sub-order to returned for one unit; partial quantities need line-level outcome allocation and aggregate-derived display semantics.

**Gate:** T03/T04/T08/T12, including two competing commands and malicious duplicate lines. Historical parent/sub-order snapshots remain readable. Idempotent command retention and customer response-loss recovery are documented.

## 5. Stage 3 — authoritative inventory before real stock commitments

Align with P3.2.1, but bring the required safety gate before unrestricted pilot traffic. Existing plan postpones it behind other work; founders must record this sequencing change rather than assuming an audit overrides dependencies.

### Minimal stock model

Start against existing `products.id`, without waiting for perfume/variant normalization. Add an authoritative balance keyed by seller/listing and, if useful, one internal default location. Physical multiple warehouses and transfer UI are later features. Keep `products.stock` as a compatibility projection of approved available stock during rollout; direct stock edits must route to an audited adjustment command, not become a second independent truth.

Maintain `on_hand`, `reserved`, `safety_stock`; available = on_hand − reserved − safety_stock. Record immutable movement deltas, operation identity, reason, time and actor. Add reservations with line allocation, quantity, state and expiry. Reservation and order/line persistence share one transaction or a well-defined durable provisional-order command; avoid an orphan reservation with no recovery identity.

Atomic reserve uses a locked row or conditional update requiring sufficient available units. Reserve all basket items in a deterministic order; any failure rolls the entire new order/reservation command back. Never inspect availability with SELECT and later overwrite it with a computed old value. Expired reservations remain counted until an idempotent release command processes them, or are handled under the same reservation lock during admission; there must be one definition across read and write paths.

### Quantity lifecycle

Founders/operations choose timeout, COD confirmation duration and consume point. Recommended physical model for review: reserve increases committed quantity; dispatch reduces both on-hand and reserved once; cancellation before dispatch releases reserved; refused parcel in transit does not magically reappear on-hand; receipt and inspection record restock/damage separately. Avoid double decrement on both dispatch and delivery. Separate accounting eligibility from physical movement.

Refund does not itself restock; physical inspection does. Support cumulative partial allocation, seller off-platform stock adjustments and safety buffers. External stock synchronization needs version/sequence/import identity, freshness and conflict handling; do not promise instantaneous truth for a seller who never reports off-platform sales.

**Backfill:** verify current stock with sellers, create one opening movement/balance per listing using a unique backfill operation key and measured as-of date. Do not infer on-hand from old orders, because old checkout never decremented it. Unverified stock cannot be certified by copying the existing integer.

**Gate:** T02/T08 under two independent database connections, expiry worker retry, concurrent seller adjustment, partial return and stale external feed. Stop accepting new orders on inventory invariant failures; do not silently fall back to the old nonreserved checkout.

## 6. Stage 4 — outbox/jobs, notification reliability and privacy operations

Implement P1.1.2 and notification adapter work alongside stages 2–3 so expiry and notices exist when their producer commands activate. Choose one approved scheduler mechanism (ADR-04), not a cron runner plus a second queue stack by default.

Write minimal outbox event in the same transaction as the state change. A worker leases events, invokes providers with deterministic idempotency keys, records delivery status/receipt, retries transient failures with bounded backoff/jitter and escalates exhausted/ambiguous results. A transaction committing once does not mean an external SMS/PSP call happens once; each effect needs idempotency/reconciliation.

Use durable job command/run keys and leases; recover abandoned leases, authenticate scheduled endpoints, separate scheduled period identity from actual attempt ID. Do not retain sensitive provider payloads or OTPs unnecessarily. Schedule reservation expiry, retention, SLA checks, orphan media handling and financial eligibility/reconciliation. Record schedule ownership, last success, backlog age, failure count and alert routing.

Enable privacy submission/verification/export/erase workflows using existing `privacy_requests` and consent records. Preserve legally required financial history through approved pseudonymization/redaction; don't cascade-delete history just because the ERD has an on-delete action. Define KYC/session/audit/OTP/media retention with counsel.

**Gate:** commit/rollback/outage/retry/lease tests T10; no silent orders; retention runs with run evidence and alerts. Real SMS and real error reporting replace stubs; keep production startup refusal for any remaining configured stub.

## 7. Stage 5 — financial authority, COD reconciliation and ledger-based statements

Align with P3.1.1–P3.1.6; update ADR-03's simplistic `(sub_order,kind)` key before implementation because partial refunds/adjustments produce multiple legitimate events of a kind.

### Immutable terms and event accounting

Read approved effective-dated rule sets/overrides and seller terms; snapshot fees/source/versions/rounding/cash-owner/delivery arrangement/reserve/return policies on the purchase graph. Persist evidence-backed attribution decisions and considered touch links. Unknown stays unknown. Prevent overlapping effective intervals, invalid bps and self/duplicate approvals.

Add a small reviewed ledger account vocabulary, transaction header (unique economic event key/currency/effective time/posted time) and immutable signed integer postings. All postings for a transaction must balance at commit; each carries the appropriate seller/sub-order/line provenance. An unbalanced or missing-evidence event cannot post. Use bigint DB aggregates where growth warrants it; explicitly convert to safe JS integer/string at the domain/API boundary. No float money.

Event keys identify actual events: sale eligibility for a defined earned allocation, specific successful partial refund, remittance, adjustment, chargeback and correction. Reversals reference original entries; cumulative allocations cannot exceed the original amount/quantity. Original transaction is never edited. A pending refund is a durable obligation, not revenue reversal proof; completed manual refund requires approved evidence, provider refund requires confirmed transaction evidence. Define accrual/cash tax treatment with accountant.

### COD and settlement direction

Represent expected amount, collector, cash owner, fee, amount received, event identity and reconciliation exception. Amounts must reconcile across allocated shipments/sub-orders. Repeated import/webhook does not overwrite evidence; shortage/excess remains unresolved until recorded adjustment or matching payment. A courier timestamp alone does not unlock full seller funds.

When seller collects cash, the platform may have a commission receivable/invoice instead of a seller payable. When authorized platform/PSP collection applies, seller payable and fee treatment differ. D-5 determines the final document/transfer, not a shortcut which pays gross to a house already holding the buyer's cash. Model both only after reviewed terms; do not build a customer wallet/fund-holding product.

### Statements and payout execution

Retain `payouts`/`payout_lines` as statement header/summary. Add settlement-entry claims and explicit allocations tying once-eligible positions to one statement. Re-running a job returns/continues the same statement. Cash transfer is a separate approved idempotent command with immutable external reference, ambiguous-outcome recovery and finance review. One person cannot draft/approve/execute their own unrestricted money command.

Freeze statement lines after approval/posting; void/reissue is an explicit compensation flow retaining allocation history. Remove or redesign the old completed-only trigger only with its replacement reversal/balance invariants, never merely disable the check. Sum authoritative saved line amounts/rounding instead of choosing the last line's rate. Validate statement total and allocation sums against ledger positions and source graph.

**Backfill/opening:** finance reconciles every legacy statement/refund/remittance to independent evidence. Record a signed opening reconciliation run; classify unpaid/draft/paid/unknown separately. Import only verified opening positions with stable unique keys and no duplicate historical claims. Preserve old reports and statement IDs; do not rerun old payouts to generate an opening balance.

**Gate:** T04/T05/T06/T09 across cancellation/refusal/partial return/pre- and post-payout refund, repeated and concurrent runs, fees/shipping/discounts and both approved cash arrangements. Dual-calculate shadow statements over representative fixtures/authorized clone until all discrepancies are resolved. Only then consider switching on software settlement after explicit approval.

## 8. Stage 6 — electronic payment and courier integrations (capability gated)

Keep current COD and manual-courier behavior available. Add provider-neutral payment intent/attempt/transaction/refund ports and adapters at the composition root; provider name/capabilities can start in code/config. A DB `payment_providers` table is not required until operational versioned configuration needs it. Never store secrets/card data in business rows.

Reuse `webhook_events` as authenticated deduplicated ingress: verify signature using provider rules, store unique provider/event identity and payload hash/minimal evidence, then durably process. Do not mark processed until financial/operational updates and outbox commit. Replays and late/out-of-order events follow a monotonic/provider-aware transition/reconciliation policy. A timed-out attempt stays unknown/pending reconciliation; do not blindly retry a second capture.

Courier ports grow into booking, label/tracking, tariffs and reconciliation, keeping existing order/dispatch/fee snapshots. Add delivery-attempt facts and shipment-line quantity allocations before partial shipping. Reader logic must stop assuming first shipment or any remittance = whole order complete. Snapshot service area and shipping fee/cost owner; replacing the flat 55 EGP placeholder requires actual accepted courier terms.

**Gate:** provider sandbox contract/replay/outage tests, PSP/courier commercial approval, safe secret management, monitored exception queues. Additional providers are adapters plus configuration, not extra order/commission engines. No automatic fallback to another provider after an uncertain capture.

## 9. Stage 7 — governed analytics, catalogue normalization and growth

First expose accurate platform and seller-scoped read models over operational/posted facts. Keep placed-cohort operations separate from posted financial periods. Add measured cost entries and completeness before margin/CAC; report 07 supplies grains/semantics. Seller rows derive tenant from session, never trusted query input. If read views are needed, verify invoker/owner semantics and grants explicitly; a privileged refreshed materialized view is not automatically protected by underlying RLS.

Only after demand/performance evidence: add canonical `perfumes`, variants and stable note links, then backfill each existing product to its own known variant without merging same-name scents automatically. Keep legacy product IDs and arrays while readers dual-read; correct mismatches before contract. Brand reseller mapping, bundles, multiple operational warehouses, CRM/external sales, promotion/loyalty/subscription and AI remain feature gates. Separate imported external-channel facts and purposes from marketplace GMV/global customer identity.

Replicas/ELT/warehouses/SCD2 come after measured reporting load or integration need, not because a conceptual ERD has many entities. Define incremental watermark+lookback, batch ID, lineage, row counts, reconciliation and access contracts when the first real pipeline is introduced. No per-brand database by default.

## 10. Expand/contract, indexes and recovery controls for every stage

1. **Preflight:** record schema/hash/version, source row counts, orphan/mismatch checks, estimated lock/workload impact and named rollback owner. Verify backup/restore. Review all SQL-only constraints/RLS/grants alongside Drizzle; do not generate a blind diff.
2. **Expand:** add tables/nullable columns/compatible functions and deny-by-default RLS/grants before exposure. New tables must not rely on a broad default grant as security. Use concurrent indexes where measured lock risk warrants it, via a deliberate nontransactional release step; do not embed them blindly in a transaction-wrapped runner.
3. **Backfill:** bounded, resumable batches with deterministic operation keys, source evidence, checksums, counts and anomaly quarantine. Never make up cash, source, consent or stock. Track old/new totals at the correct grain.
4. **Constrain:** where supported, add NOT VALID FK/CHECK then VALIDATE after cleanup; unique constraints require separate duplicate remediation/index strategy. Validate cross-tenant ownership and line totals before enforcing NOT NULL. Resolve legacy ambiguity by review, not deletion.
5. **Compatibility:** one transactionally maintained source of truth with compatibility projections; never independent dual writers. Shadow new calculations and compare; client/API reads remain backward compatible until every consumer is switched.
6. **Cut over:** feature gate to new commands/read paths only after invariants and operations pass. Fail closed for stock/money; don't route failed new writes back through unsafe legacy code. Keep old history read-only.
7. **Rollback:** before activation, revert application reads/writes to compatible old version while leaving additive schema. After reservations/ledger events exist, disable new intake/settlement, preserve rows and reconcile/forward-fix; an old build that bypasses reservations or refunds is no longer a safe rollback. Unsent outbox work can be paused; already captured/transferred money needs compensating evidence, not row deletion.
8. **Contract later:** remove legacy writable fields or old exposure only after a full observation window, external consumer check and approved reversible data export/archive. Keep historical financial snapshots/statements indefinitely according to approved legal retention, not by a generic cleanup rule.

## 11. First real order vs production release

**First real order:** lawful seller/category/returns/customer policy; identified staff; verified private-data boundaries; truthful accepted price/shipping/area; retry-safe atomic order and stock commitment; reachable cancel/refuse/return/support with reason; real notices; amount-aware manual COD reconciliation and documented manual refund/statement controls; payout switch off; monitored/recoverable environment and timed restore; named operators. If a manual pilot defers automated ledger transfer, founders must explicitly accept the limited money-handling design and reconciliation burden. This is not approval to waive stock/idempotency/privacy safety.

**Before software payout or certified financial BI:** stage-5 ledger, bounded reversals/claims, terms/attribution evidence, two-person approvals, opening balance reconciliation and all money acceptance cases. **Before electronic payments or automated courier:** stage-6 capability gates. **Before broad multi-instance production:** shared rate limits, durable jobs, privacy retention, capacity/pool budget and incident/recovery evidence.

## 12. Precise next implementation PR after review

Recommended **DB-SAFE-01 — seller ownership and COD authority guards**: validate seller ownership of listing brand at API/repository boundary and enforce the corresponding DB consistency rule; prevent seller writes to shipment COD collection/remittance/proof fields while preserving normal manual dispatch. Add hostile seller-A/B brand tests and seller-sets-remittance tests under actual nonowner SQL roles, plus API regression tests. Inspect legacy conflicting rows first; no destructive cleanup or existing snapshot rewrite. This is a narrow integrity/security PR, not a catalogue redesign or payout enablement.

Record this new task and its security-critical approval in the canonical plan/register; it is not currently a READY task. Then execute **P1.2.4** for idempotent placement and locked transitions, with explicit duplicate-ID/accepted-quote regression scope added by review. Remaining P0 stages follow the dependency gates above. Do not start either PR under this audit-only request.
