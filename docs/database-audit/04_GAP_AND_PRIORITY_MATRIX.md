# DIYAR — reconciled gaps and priorities

18 October 2026. All target items are **PROPOSED**, subject to review and recorded decisions. No implementation performed. Evidence means inspected source, not a fresh passing integration test. Report 01 contains the exhaustive AS-IS inventory; report 05 expands findings F01–F22; report 07 defines acceptance scenarios T01–T15.

## 1. Architectural recommendation and prioritization

**KEEP** one shared PostgreSQL transactional database, seller as tenant, existing order/sub-order/line IDs, `products` as the seller listing, domain ports, Drizzle repositories, RLS, audit, CMS and bilingual copy. **MODIFY** unsafe workflows before expanding discovery or BI. The target ERD shows an evolved destination, not a single migration or a request to create every node now.

P0 = before affected real commerce / sensitive access. A software payout remains blocked until all money P0s pass. A genuinely manual, tightly limited COD pilot requires separate founder/legal approval and the controls in report 06; it is not the same as production readiness. P1 = before enabling the relevant electronic payment, staff, integration, BI or scaled operational capability. P2 = evidence-gated growth/future. No numeric effort estimates: this copy has no runtime baseline, volume profile, production DDL or migration rehearsal evidence to ground them. Size labels indicate scope, not promised duration.

Owners: **BE** backend/domain; **DB** database/security engineer; **FIN** finance/accountant + technical founder; **OPS** operations; **FND** founders; **LEGAL** qualified counsel/PSP; **DATA** analytics; **UX** product/front end. Every implementation requires an assigned named person later; these are accountable functions for this review.

## 2. Risk-ranked correctness backlog

| Rank / finding | As-is → required invariant | Action / priority | Owner; dependency | Impact / scope | Acceptance and evidence |
|---|---|---|---|---|---|
| 1 F01 | Recomputed payout statements can repeat → one durable claim per economic event | MODIFY + ADD ledger/claims; P0 before software settlement | FIN/DB; D-5, ledger design | Money loss; large | T05; `platform.ts:146`, `repositories.ts:598`, `schema/money.ts:84` |
| 2 F02 | Refund case amount has no payment/ledger effect → bounded line-quantity refund with successful reversal evidence | MODIFY + ADD; P0 | FIN/BE; return/cost policy, F01 | Incorrect liabilities; large | T04/T05; `routers/returns.ts:274`, `return-repository.ts:164`, `0001:290` |
| 3 F03 | Count read, never reserved; duplicate product lines accepted → aggregate demand and reserve atomically | MODIFY + ADD; P0 | BE/DB; reserve/consume policy | Oversell even without concurrency; medium/large | T02; `cart.ts:135`, `:166`, `repositories.ts:293` |
| 4 F04 | Fresh reference per retry → stable scoped request key, payload hash and replayable result | MODIFY + ADD; P0 | BE/DB; task P1.2.4 dependency approval | Duplicate customer obligations; medium | T03; `orders.ts:171` |
| 5 F05 | Read-then-write transitions and absent cancel/refuse workflows → locked/conditional actor-authorized moves | MODIFY; P0 | BE/DB; P0.2.6, cost/reason policy | Double events / incomplete outcomes; medium | T04/T12; `repositories.ts:531`, `0001:258`, seller/platform routers |
| 6 F06 | Any remittance timestamp means cash-in-hand → immutable, amount-matched, cash-owner-aware remittances | MODIFY + ADD; P0 | FIN/DB; D-5, courier terms | Zero/partial remittance can unlock full payable; medium | T04/T05; `owner-report-repository.ts:68`, `repositories.ts:571` |
| 7 F09 | Public row contains operational/private-looking fields; missing tenant relationship checks → least-data reads and child ownership integrity | MODIFY; P0 before private data | DB/security; field classification + brand policy | Disclosure, cross-linked data; medium | T01; `0002:115`, `schema/sellers.ts:17`, `schema/catalogue.ts:37` |
| 8 F10/F16/F17 | Coarse actor roles, arbitrary first staff, forged GUC possible with SQL privilege → verified identity and least authority | MODIFY; P0 for trustworthy onboarding/ops | DB/BE/FND; distinct staff-role decision, ADR-05 | Wrong principal/overbroad money actions; medium/large | T01/T11; `identity-repository.ts:29`, `trpc.ts:218`, `0002:24` |
| 9 F07 | Empty touches; decisions/windows discarded → persisted evidence-backed sub-order decision | MODIFY + ADD; P0 before differentiated fees | BE/FND/LEGAL; DR-02, D-4, retention | Central business proposition untestable; medium | T06; `orders.ts:180`, `repositories.ts:219` |
| 10 F08 | Constant rules; last-line bps, aggregate fee recompute → effective-dated agreed terms and authoritative line sums | MODIFY; P0 before billed statements | BE/FIN; D-4, commission rounding | Historic rate/rounding errors; medium | T06/T09; `place-order.ts:135`, `owner-report-repository.ts:59` |
| 11 F12 | No durable jobs/notifications/purges → transactional delivery, retries, expiry and retention | ADD; P0 operational core | BE/OPS; choose ADR-04 runner and SMS provider | Silent orders and expired commitments; medium/large | T10; `providers/stubs.ts`, no job/outbox tables |
| 12 F14/F18 | No verified recovery or safe release runner → migration/recovery evidence before real data | MODIFY + OPERATE; P0 release gate | DB/OPS/FND; RPO/RTO and environment access later | Availability / incompatible release; medium | T10/T14; `migrate.ts:138`, journal only 0000, infrastructure docs |
| 13 F13 | Current-state placed cohort → explicitly labelled operational cohort and posted-money series | MODIFY; P0 for financial claims, P1 richer BI | DATA/FIN; financial authority F01/F02 | Misleading GMV/revenue | T09; `owner-report-repository.ts:100`, `owner-metrics.ts:229` |
| 14 F21 | Last-seen/quote facts dropped → explicit accepted price/fulfilment quote version | MODIFY; P0 checkout consent | BE/UX; price-change policy | Higher total accepted silently; medium | T03; checkout `actions.ts:60`, `cart.ts:180`, quote bucket `cart.ts:222` |
| 15 F11 | COD-only order status shell → durable provider lifecycle before electronic payments | ADD + MODIFY; P1 capability gate | BE/FIN/LEGAL; provider/PSP contract | Retry/refund/chargeback safety; large | T03/T04/T10; `providers/ports.ts:56`, `schema/orders.ts:61` |
| 16 F15 | Local checks but missing aggregate/immutability/approval guards → explicitly enforced invariants | MODIFY; P0 money/ownership, P1 refinements | DB/FIN; semantics | Corrupt graph/terms; medium | T04/T05/T06; `0001:23`, `:52`, `schema/money.ts:42` |
| 17 F19 | Listing and scent conflated; first-brand assumptions → additive variant identity and explicit brand authorization | MODIFY + ADD later; P1/P2 | BE/product; category/reseller policy | Extensibility and data consistency; large | T15; `schema/catalogue.ts:6`, `listings.ts:59` |
| 18 F20 | English-only content-image policy absent; draft row public → language-correct publication projection | MODIFY; P1, private drafts P0 | BE/DB/editor | Missing English image / draft disclosure at SQL boundary | T01/T15; `0022:65`, `0009:146` |
| 19 F22 | Append-only product revision table has no production writer → capture material before/after facts atomically | MODIFY; P0 before live seller edits | BE/DB; controlled diff fields and actor | Audit provenance; medium | T15; `listing-repository.ts:149`, `:188` |

## 3. Every proposed V2 entity reconciled

All existing nodes retain their AS-IS meaning unless explicitly changed. New nodes in report 03 are design only. Existing nodes not drawn with attributes there still retain the columns from report 02; the target is intentionally not a full replacement DDL.

| Proposed entity/capability | Repository counterpart / actual state | Disposition & stage | Owner / dependency / expected impact | Acceptance |
|---|---|---|---|---|
| SELLERS | `sellers`, public/private field mixing | KEEP identity, MODIFY projections; P0 | DB/FND; field classification | T01 |
| SELLER_STAFF | `seller_staff`, owner/manager/fulfilment/viewer enum, broad mutations | MODIFY; P0 for active roles | BE/DB; permission decision and individual sign-in | T01/T11 |
| SELLER_BRAND_LINKS | Not present; `brands.seller_id` already supports seller→many brands | DEFER many-seller/brand join; P2 | Product/LEGAL; permit resellers first. Keep current ownership FK | T15 |
| BRANDS | Existing separate label, one owning seller | KEEP; optional later links | BE; distinguish manufacturer ownership from selling permission | T15 |
| PERFUMES | Not present; `master_product_id` unused, not an FK | ADD only when grouping proven; P1/P2 | Product/DB; explicit deduplication rules. No guesses from names | T15 |
| PRODUCT_VARIANTS | Not present; each product has size/concentration/form | ADD additively; P1/P2 | Product/DB; one variant per existing saleable row initially | T15 |
| SCENT_NOTES | `note_glossary` holds Arabic/English/icon; no canonical ID relationship | MODIFY/reuse glossary + add stable IDs later; P2 | Content/DB; synonym/locale ownership | T15 |
| PERFUME_NOTE_LINKS | Product arrays only | ADD canonical tier links after backfill review; P2 | Content; no destructive array conversion | T15 |
| SELLER_LISTINGS | `products` already is seller listing | REJECT duplicate table/rename; MODIFY `products` with nullable variant FK later | BE; preserve product/order IDs | T15 |
| LISTING_PRICE_HISTORY | `product_revisions` schema exists, but production listing updates do not insert revisions | MODIFY to populate existing revisions atomically; no duplicate price-history table now | BE/FIN; actor, quote/price policy; P0 for material-change audit | T03/T15 |
| INVENTORY_LOCATIONS | Absent | ADD one logical default only if balances require location identity; multiple warehouses DEFER P2 | DB/OPS; tenancy; avoid operational warehouse UI now | T02 |
| INVENTORY_BALANCES | `products.stock` is mutable count, not availability ledger | ADD authoritative on-hand/reserved projection; P0 | DB; approved adjustment/reservation rules; legacy stock compatibility | T02/T08 |
| INVENTORY_MOVEMENTS | Absent | ADD append-only operations with unique references; P0 | DB/BE; integer quantity and replay semantics | T02 |
| INVENTORY_RESERVATIONS | Absent | ADD finite lifecycle/expiry; P0 | BE/OPS; consume timing and COD duration | T02/T03 |
| CUSTOMERS | Existing phone-based guest identity; saved-address table; no customer account/possession proof | KEEP identity and order snapshots; MODIFY approved verification/privacy workflow; P0 | BE/LEGAL; D-2, consent/retention, seller data minimization | T01/T07/T11 |
| ORDERS | Existing marketplace parent | KEEP, add request/quote/payment references; P0 | BE; immutable historical snapshots | T03/T04 |
| SUB_ORDERS | Existing tenant fulfilment slice | KEEP, add immutable terms/attribution provenance; P0 | BE/DB; approved economics | T04/T06 |
| ORDER_LINE_ITEMS | Existing name/SKU/size/price/rate snapshots | KEEP, protect money snapshot, add additive brand/variant/terms IDs and allocation refs; P0/P1 | DB/FIN; no historical repricing | T04/T06 |
| SUB_ORDER_TRANSITIONS | Existing append-only rows | KEEP + MODIFY atomic command linkage/reason/actor validation; P0 | BE; unique transition/event identity | T12 |
| SHIPMENTS | Existing one-to-many FK; readers assume first/any | KEEP; enforce present workflow, add line allocations before partial shipping; P0/P1 | BE/OPS; per-shipment money/attempts | T04/T10 |
| DELIVERY_ATTEMPTS | Only counter in shipments, no writers | ADD attempt evidence; P0 simple manual attempt, P1 provider ingress | OPS/BE; refusal reason/cost policy | T04 |
| RETURNS | Existing optional one-line case, no quantity | KEEP header; ADD return_lines; P0 | BE/LEGAL; partial quantity and current-policy snapshot gap | T04 |
| RETURN_LINES | Absent; `returns.line_item_id` legacy | ADD explicit quantities, retain legacy column during compatibility; P0 | DB/BE; no cumulative over-return | T04 |
| PAYMENT_PROVIDERS | No DB table; `PaymentGateway` interface and one COD adapter | KEEP registry/ports; DEFER provider metadata table until operator-managed config needed | BE/LEGAL; no secrets in DB | T10 |
| PAYMENT_INTENTS | Order method/state/ref only | ADD before electronic payment; P1. COD obligation may reuse same domain lifecycle | BE/FIN; D-5 | T03/T10 |
| PAYMENT_ATTEMPTS | Absent | ADD as part of payment aggregate; P1 | BE; provider-independent request identity | T03 |
| PAYMENT_TRANSACTIONS | Absent | ADD immutable provider facts; P1 | FIN/BE; authorization/capture/void/refund/chargeback semantics | T04/T05 |
| PROVIDER_EVENTS | `webhook_events` unique provider/event inbox shell | MODIFY existing table, REJECT parallel duplicate inbox; P1 | BE; signature verification, state/leases/retries, payload privacy | T03/T10 |
| REFUNDS | `returns.refund_piastres` is recorded case amount only | ADD durable refund obligation/evidence + allocations; P0 manual, P1 provider | FIN/BE; approval and success proof | T04/T05 |
| COD_REMITTANCES | Mutable shipment amount/timestamp | ADD immutable evidence and shortage exception states; P0 | FIN/OPS; cash owner/invoice direction | T04/T05 |
| COMMISSION_RULES | Existing `commission_rule_sets` + `commission_overrides` unused | MODIFY/read existing tables; reject parallel rules table | FIN/BE; D-4, effective dating and distinct approval | T06 |
| ATTRIBUTION_DECISIONS | Domain object exists transiently only | ADD persistent per-sub-order decision and evidence links; P0 | BE/FND; DR-02; retain raw touches minimal | T06 |
| LEDGER_TRANSACTIONS | Absent | ADD event-idempotent financial transaction header; P0 before software settlement | FIN/DB; agree account model; do not use only (sub_order,kind) uniqueness for partial refunds | T05 |
| LEDGER_POSTINGS | Absent | ADD balanced, immutable integer postings, scoped accounts; P0 | FIN/DB; deferred commit balance check + positive event IDs | T05 |
| PAYOUT_STATEMENTS | `payouts` already statement header | KEEP name; MODIFY lifecycle, direction and approval | FIN/BE; no duplicate parallel header | T05 |
| PAYOUT_LINES | Existing per-payout/sub-order summaries | KEEP; ADD payout_allocations referencing once-claimable settlement entries | FIN/DB; do not reference mutable current product | T05 |
| SELLER_SALES_CHANNELS | Absent | DEFER P2; distinct namespace | Product/LEGAL; demand and controller/processor decisions | T13 |
| SELLER_EXTERNAL_ORDERS | Absent | DEFER P2; never insert as marketplace order for convenience | Product/DATA/LEGAL; opt-in, dedupe and deletion contract | T13 |

## 4. Blueprint additions outside V2

| Suggested concept | Recommendation and rationale | Owner / dependency / priority / impact |
|---|---|---|
| Seller legal identity, agreements, operating terms | MODIFY private metadata, ADD versioned agreement/terms records once counsel defines evidence; preserve verification controls | LEGAL/FIN/DB; D-5/L3/L7/L19; P0 policy, P1 data evolution |
| Private KYC files | MODIFY existing evidence references into private, time-limited object access; do not store documents publicly or as table blobs | Security/LEGAL; R2 private-bucket configuration UNVERIFIED; P0 before collecting KYC |
| Claims evidence taxonomy | KEEP `evidence_refs`/source bands now; normalize only with content workflow | Content/LEGAL; P1/P2; no invented verification |
| Categories, bundles/gifts | DEFER new bundle inventory/price graphs until product policy; ordinary gift discovery can reuse controlled occasions | Product; category boundary; P2 |
| Dedicated price history beside revisions | MODIFY existing revision capture (currently missing); REJECT a second history store until required | BE/FIN; P0 capture, P2 separate-query trigger |
| Checkout idempotency keys | ADD `checkout_requests`; unique (scope,key), hash, state/result; not unique scope or key independently | BE/DB; P0; prevent retries and concurrent duplication |
| `seller_fee_terms` | Reconcile into versioned `seller_operating_terms` + current commission rule structure; avoid overlapping stores of truth | FIN/FND; D-4; P0 |
| `settlement_entries` | ADD durable economic position/claim mapped to balanced transactions; existing payouts remain headers | FIN/DB; P0; claim one event once |
| Ledger accounts | ADD small explicit account vocabulary, not a configurable enterprise general-ledger product | FIN; P0 before auto-money; balanced accounting scope only |
| `refund_allocations` | ADD line/quantity/tax/shipping/discount/fee ownership allocation | FIN/DB; P0; partial economic outcome without whole-order reversal |
| `shipment_lines` | DEFER until split shipment enablement, but keep one-to-many shipment model and design receipt proof accordingly | OPS/BE; P1; no first-shipment assumptions |
| Measured costs/campaign spend | ADD `cost_entries` with known/zero/unrecorded provenance before margin/CAC; campaign tables later | FIN/DATA; A-2 + cost allocation; P0 truthful labels, P1 entries, P2 campaigns |
| Separate review moderation table | KEEP existing review moderation fields + audit for now; ADD only if immutable moderation-event stream needed | Trust/DB; P1; no seller deletion |
| Consent/deletion tables | KEEP `consent_records` / `privacy_requests`; MODIFY workflows and retention; reject duplicate `deletion_requests` | LEGAL/BE; P0 before collection promises |
| Outbox/notifications/jobs | ADD durable event table, job attempts/leases/unique run keys and delivery receipts | BE/OPS; ADR-04 decision; P0; OTP test file is unrelated |
| Rate-limit windows | ADD DB-backed atomic windows or approved edge design; no Redis solely by habit | Security/BE; P0 before multiple instances/SMS scale |
| Seller CRM/external order lines/contacts | DEFER P2 with separate tenant-private identities and purposes; no automatic global-customer merge | Product/LEGAL; external data agreement |
| Research prospects/outreach/interviews | DEFER app tables until manual workflow creates measurable need; research documents already exist | FND/OPS; P2; never populate verified `sellers` from scraped prospects |
| Loyalty/subscriptions/referrals/AI | DEFER until recorded gates; ledger dimensions and ports preserve seams without empty tables | FND/Product; P2 beyond pilot evidence |
| Warehouse/read replica/ELT/SCD2 | DEFER physical infrastructure; ADD governed API read models first | DATA/DB; load/retention evidence and access controls; P2 |
| `metric_definitions`, `dataset_grants`, ingestion/quality tables | KEEP versioned definitions/tests in repo now; ADD ingestion run metadata with first actual import/ELT | DATA; P1/P2; do not build a data platform around an empty dataset |
| Tenant materialized views / one schema per seller | REJECT as default; use scoped read models and grants, test export isolation | DB/DATA; P1; refresh ownership and RLS are independent concerns |
| Physical database per brand | REJECT; no demonstrated regulatory/enterprise isolation need; cross-seller checkout stays transactional | FND/DB; reconsider only under measured/contractual requirement |

## 5. Target invariants not expressible by drawing edges

The target graph deliberately omits a wholesale catalogue rewrite. `products.variant_id` stays nullable through migration; existing order lines retain `product_id`. Current names `webhook_events`, `payouts`, `payout_lines`, `commission_rule_sets` and `privacy_requests` remain. The graph's edge cardinalities express FK possibility, not automatic guarantees of nonempty sub-orders, balanced postings, authorized sellers or successful provider settlement.

Tenant-linked children require matching seller/product/sub-order ownership, preferably composite unique keys/FKs where practical; RLS is not a substitute. Idempotency uniqueness must identify a specific command/economic event. Several partial refunds can affect the same sub-order, so the earlier ADR-03 UNIQUE(sub_order_id,kind) is insufficient by itself. An allocation claim remains attached to its original statement through retries; void/reissue must post explicit compensating events and never silently free a paid claim.

Inventory availability is `on_hand - active_reserved - safety_stock`, constrained nonnegative under the approved policy. Purchasability additionally requires a live seller and published listing, allowed area and current approved price. No warehouse, gateway or CRM table alone makes this real time. External stock is bounded by adapter freshness and seller safety-stock policy, not a promise of perfect external synchronization.

No legacy payout/return is silently treated as a settled financial event during backfill. Unknown source stays unknown; historical absent evidence stays absent. Whether manual pilot invoices/opening balances are admissible must be decided and independently reconciled.
