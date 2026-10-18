# DIYAR — analytics contracts and launch readiness

18 October 2026. Authority: repository `docs/ANALYTICS_DEFINITIONS.md` and inspected computations; the ZIP analytics contract is proposed. This document labels current behavior separately from recommendations. No dashboard, view, warehouse, job or acceptance test was implemented by this audit.

## 1. Current reporting authority and exact semantics

Current operator dashboard: `/ops/insights` → `insights.owner` (`packages/api/src/routers/insights.ts:29`). It explicitly checks platform `admin`; a platform operator is refused. Seller dashboards supply operational queues/listings/returns/statements, not a dedicated seller BI surface. No reporting schema, warehouse/ELT, approved BI export role or tenant aggregate materialization exists in the inspected implementation.

`cairoPeriod` selects today / 7 / 30 / 90 Cairo calendar days through current `asOf`, using `Africa/Cairo` day boundaries (`domain/src/insights/report-period.ts:60`). Repository predicates are `[from,to)`. It selects **orders placed** during the period, then their current sub-order facts (`db/src/owner-report-repository.ts:93`). This is a placed-order cohort measured as of now. It is not revenue earned, money posted, or cash received during that same period. Keep that distinction visible; don't silently replace the approved placed-cohort view with a posting-date graph.

| KPI | What the current implementation computes | Authority / limits | Recommended change or readiness |
|---|---|---|---|
| Placed | Number of sub-orders of selected parent orders | `owner-metrics.ts:246`; seller grain, not distinct customers/orders | Label cohort/time and count grain. Parent placedAt vs sub.createdAt discrepancy usually small but define explicitly. |
| Confirmed/dispatched/delivered | Nonnull milestone timestamps, cumulative within selected cohort | `owner-metrics.ts:250`; milestones remain after later outcomes | Good operational funnel base. Atomic transition fixes prevent duplicate/overwritten evidence. |
| Completed/earned | Classifier returns earned for delivered + `cashInHand` + elapsed reserve | `settlement-classify.ts:37`; reserve currently read from seller, cashInHand = any remittance timestamp | PARTIAL. Fix amount/cash-owner proof and snapshot terms; do not equate this flag with posted money. |
| GMV | Sum merchandise of current earned sub-orders, shipping excluded | `owner-metrics.ts:284`; returned state excluded but recorded partial refunds do not change it | Retain operational gross-earned metric; add clearly defined refund/net series from ledger. No external-channel sales. |
| Held GMV | Sum current held sub-order merchandise | `owner-metrics.ts:331`; delivered but remittance/reserve not satisfied | Keep distinct, show reason and ageing. Fix defective cash proof first. |
| Platform revenue | Recomputed aggregate fee using selected line bps on sub-order merchandise | `owner-metrics.ts:280`; not sum persisted line commissions, not net refund postings | Not certified. Use versioned line allocations/posted fee facts, preserve timing. |
| Effective take rate | Rounded bps = platformRevenue / earned GMV, zero when GMV zero | `policies/commission.ts`, `owner-metrics.ts:333` | Denominator and refund basis must be named. Never blend a gross denominator with unexplained net fee. Show no-GMV appropriately. |
| Completed customer orders | Distinct order IDs with at least one earned sub-order | `owner-metrics.ts:286` | Keep. Partial earned basket counts once, not once per seller. |
| AOV | Earned merchandise / distinct customer orders with any earned sub-order; rounded piastres | `owner-metrics.ts:335`; returns null for zero completed orders | Keep definition; do not divide by sub-order count or joined line rows. |
| Source mix | Earned GMV/sub-order count grouped by line-derived source | `owner-metrics.ts:288`; ordinary checkout unknown; last-line map fallback | Real source insight blocked by F07/F08. Order source is only largest-house summary, not per-seller authority. |
| Answered on time | Answered at/before confirm deadline / answered-or-past-deadline sub-orders | `owner-metrics.ts:185`; response = first confirmed OR rejected transition | KEEP; prompt decline is an answer, not a successful sale. |
| Open confirmation breaches | Placed/awaiting_seller and current time strictly beyond deadline | `owner-metrics.ts:190` | KEEP; future unanswered requests are not yet late. |
| Median answer delay | Rounded minutes from placement to first confirm/decline | `owner-metrics.ts:193`, `owner-report-repository.ts:148` | Define invalid/negative timestamps as data-quality exceptions. |
| Dispatch on time | Dispatched by deadline / dispatched-or-past-deadline with a deadline | `owner-metrics.ts:198`; separate open confirmed breach count | KEEP snapshot dispatch promise; coordinate cancellation exclusions if policy changes. |
| Rejection/refusal/return rates | Rejected / placed; refused / dispatched; returned / delivered; reason/geography slices | `owner-metrics.ts:216`, `:268` | Refuse/return writers incomplete; partial returns need quantity/value and case metrics rather than pretending every case returns entire sub-order. |
| Anonymous events/visitors | Count events and distinct anonymous IDs independently per event name/time | `analytics-repository.ts:29`, `pre-order-funnel.ts:43` | Directional counts, not person identity, sequential conversion or attributable acquisition. Bot/replay/fake ID protection is limited. |
| 90-day repeat | Defined in docs, not computed | `ANALYTICS_DEFINITIONS.md` §4: second order within 90 days / eligible aged first orders | BLOCKED definition detail: placed vs earned, successful/refunded eligibility, inclusive window and maturity. |
| Cross-brand purchase / later cross-brand repeat | No implementation | Product line has brand name snapshot but no stable purchased brand ID | Add stable approved brand identity to future line snapshots; cannot reliably dedupe historic free-text names without evidence. Separate same-basket cross-brand from later repeat. |
| CAC / LTV | Not computed; no measured acquisition spend/cost model | Attribution/cost sources incomplete | DEFER claims until measured cost allocation and eligible cohort definitions. LTV must be contribution-based, not revenue. |
| Contribution margin | Intentionally withheld | Nine input statuses, some count-only/not_recorded; `owner-metrics.ts:305` | KEEP refusal to invent costs. Add completeness gate before exposing a margin. |

### Cost input truth today

| Input | Current source/status | Readiness caveat |
|---|---|---|
| Platform transaction revenue | Recomputed fee, `recorded` label | Subject to remittance, line rounding, refund and current-term defects; not ledger-certified. |
| Payment/COD collection cost | `not_recorded`, null amount | No PSP/COD fee ingestion. Zero cannot be assumed. |
| Platform-funded delivery subsidy | `zero_by_arrangement` if earned subs seller-fulfilled; otherwise unknown | This only asserts current arrangement, not a complete courier cost reconciliation. Snapshot actual payer, receiver and fees. |
| Platform refunds | Sum case refund amount where cost_bearer=platform | No provider/manual-success evidence or status restriction in repository; unverified as cash expense. |
| Failed delivery | Count-only refused | Reasons/attempt/cost writers incomplete; no per-attempt tariff/cost facts. |
| Variable support | Count-only tickets opened in period | No assumed monetary rate. A ticket count is not a support expense. |
| Promotions | Order discount sum | No allocation to seller/platform or refunded lines; default zero currently. |
| Affiliate/creator cost | `not_recorded` | Creator field is not expense evidence. |
| Fraud loss | `not_recorded` | No ledger event; don't silently equate absence with no fraud. |

Recommended margin computation returns unavailable when any applicable term is missing. A measured zero requires explicit amount/status, arrangement/policy version, effective period and evidence; it is not `coalesce(NULL,0)`. Record amount in piastres, currency, economic event/period, seller/order allocation, evidence source, observed vs estimated status and approval. Revenue is not cash and GMV is not platform revenue.

## 2. Fact-grain contract for evolved reporting

These names describe logical read models, not newly installed database tables. Keep queries/read models first; physical marts only when needed.

| Logical fact | One row | Required stable keys / event time | Current source → target authority |
|---|---|---|---|
| Customer order | One placed buyer order | order_id, verified/guest customer anchor, placed_at | Existing orders; explicit idempotent checkout result |
| Seller order lifecycle | One sub-order + separate transition events | sub_order_id, order_id, seller_id; occurred_at + recorded_at | Existing sub_orders/transitions, atomic command IDs added |
| Purchased line | One immutable purchased listing/quantity/price allocation | line_id, sub_order_id, seller_id, product_id; future brand/variant/version | Existing checkout line snapshots (not product revision capture, which is missing); aggregate fee/discount/shipping allocations must reconcile |
| Financial posting | One immutable account posting | posting_id, transaction_id, seller/order/sub/line provenance, effective_at/posted_at | NOT PRESENT → balanced event ledger; independent of current product price/status |
| Settlement claim/allocation | One eligible position allocated once to statement | entry/claim_key, payout allocation, seller_id | NOT PRESENT → new claims; existing payout rows are not proof of transfer |
| Payment fact | One authorization/capture/void/refund/chargeback/remittance event | provider+external identity, attempt, event/received/recorded times | Mutable order/shipments now → immutable provider/COD facts |
| Return/refund allocation | One line quantity and bounded monetary component | case_id, line_id, qty, refund/event identity, success time | Current case amount → explicit return/refund lines/allocations |
| Inventory movement | One signed stock/commitment event | seller/product/location/reservation/operation ID; effective/recorded time | NOT PRESENT → movements + reconciled balance |
| Shipment/attempt | One parcel or one attempted delivery | shipment_id, attempt/provider event, sub/line allocation | Existing parcels/events + new attempt/quantity evidence |
| Review | One delivered purchased line's submission | review_id, line_id, product/customer; created/moderation times | Existing reviews; customer possession policy remains unresolved |
| Anonymous event | One permitted event, not one known buyer | event_id, anonymous_id, name, optional verified product/seller; occurred_at | Existing minimal analytics intake; no customer join or raw search text |
| External managed sale | One approved external-channel line | seller_id, channel, external_order/line IDs, ingestion batch/time | DEFER; separate dataset and purpose; excluded from marketplace GMV |

Never join parent-order totals to many lines and sum them. Aggregate lines to sub-order/order grain first or allocate monetary components explicitly. Compare Σline merchandise to sub-order merchandise, Σsub-orders/allocated discounts/shipping to order total, Σpostings to zero by transaction/currency, allocations to statements, expected COD to evidence and stock projection to movements. Missing evidence must fail or quarantine, not fallback to a plausible zero/rate.

Maintain separate timestamps for event occurrence, ingestion/recording and financial posting. Operational placed cohorts answer conversion/SLA; posting-period series answer accounting activity; remittance periods answer cash. Late events create new postings/observations, not silent rewriting of posted reports. Any future incremental refresh needs deterministic run ID, high-water mark plus late-event lookback, row counts, reconciled totals, lineage and freshness alarms.

## 3. Seller versus platform access and export design

Seller tenancy is a security boundary; brand identity is a catalogue dimension. Read own sub-order items/stock/approved statements and minimal fulfilment contact only for permitted tasks. Derive seller ID and permissions from active verified session, not URL/query/body. A seller with two brands may see its permitted combined and own-brand breakdown once supported; that does not authorize access to another seller representing the same brand.

Platform admin/finance gets approved cross-seller financial facts, and operations gets required task data. The current admin-only API report is a useful start, but DB `platform` policies are broad; a direct reporting login must not inherit those unrestricted writes. For initial seller BI, use a scoped API read model and application UoW; don't grant base-table access to a BI desktop tool.

Before any view/materialized view/export: inspect ownership and execution/grant semantics; prove seller A cannot query B by direct ID, filter omission, join, error, aggregate, cached response, export token or stale materialized row. A privileged refresh can expose rows in its stored result despite base-table RLS. Treat each export as an authorized expiring artifact with purpose/minimized columns and audit; no global customer phone list. Benchmarks require approved minimum cohort/suppression/privacy rules; a threshold alone does not prevent re-identification.

Anonymous intake policy in 0023 forbids customer_id, source, campaign, order_id and payload for the analytics service. Keep this narrower contract despite broad historical columns. Verify product→seller consistency server-side for useful tenant counts; currently client can supply these independent IDs. Public raw counts are unauthenticated telemetry, not evidence for commission or billing. Do not join anonymous visitors to phone-based orders without explicit approved lawful design.

## 4. Acceptance and existing-test evidence

**All existing test references below were inspected, not executed.** PGlite tests generally apply all migrations in setup; executing them would exceed this audit's no-migration rule. Later run pure domain tests, PGlite contract/RLS tests, server-PostgreSQL tests with actual unprivileged roles, then browser and recovery/provider sandbox exercises under explicit test authorization. Historical pass counts in the master plan are not a fresh baseline.

| ID / mandatory scenario | Existing evidence | Missing or expanded acceptance before enabling |
|---|---|---|
| T01 Tenant isolation, including joins/BI | `db/src/schema/rls.test.ts:136` seller own sub-orders; `:245` customer isolation; `sellers-contact-columns.test.ts:103` private contact joins; `api.test.ts:1594` own statements; aftercare own returns | Hostile writes/joins for stock/KYC/finance/brand ownership; role matrix; public canary columns; GUC spoof/definer calls; same seller with multiple brand/membership contexts; report/export/materialized-view isolation. No stock/KYC/BI feature can claim a passing test before it exists. |
| T02 Last-unit race / release once | Domain cart cap/availability tests in `services/cart.test.ts`; stock CHECK 0001 | Two independent concurrent connections; duplicate product IDs; one successful reserve; failures/cancel/expiry/retry consume or release once; concurrent adjustment; reservation TTL worker crash; inspection/damage restock. |
| T03 Checkout/payment retry | Atomic graph contract `ports/repository-contract.ts:114`; API COD/validation `api.test.ts:299`; inbox unique test `gates.test.ts:476` | Key/hash identity, response loss, concurrent placement, different payload rejection, quote expiry/price update and ETA input order; payment timeout/unknown result, duplicated/out-of-order webhook cannot double charge/post. |
| T04 Mixed seller outcomes / partial money | `services/settlement.test.ts` pure outcomes; `aftercare.test.ts:141` cases and amount; DB return-line membership trigger; two-house API order test `api.test.ts:329` | Two sellers, multiple units, one partial refusal/return/refund; quantity/fee/shipping/discount/cash/ledger/statement conservation; other seller unaffected; overrefund refused; pre/post-settlement outcomes; refused inventory still in transit. |
| T05 Payout replay and balanced reversals | `api.test.ts:1559` statement sums; `payout-switch.test.ts:13`; pure settlement reconciliation tests | Same and overlapping payout periods/concurrent runs yield one claim; provider execution retry safe; balance each transaction/currency; partial refund creates new reversal once; original immutable; manual opening balance evidence. |
| T06 Attribution/versioned fees | `policies/policies.test.ts` source priority/windows and snapshots; line snapshot repository contract | Actual touch capture through checkout/storage; mixed seller sources, immutable versions/evidence; distinct approvers/effective dates; unknown fair policy; rounding at odd-piastre line values; current term edits don't change history. |
| T07 Verified reviews and criticism | `ports/review-contract.ts:126`, `:193`, `:210`, `:384`; `schema/gates.test.ts:317`; `schema/rls.test.ts:291` no seller suppression | Phone possession vs knowledge; matching line/product/customer; after later return, legitimate review can remain/moderate under approved policy without trigger incorrectly requiring current delivered state; incentive disclosure retained. |
| T08 Availability vs positive stock | Cart `cart.ts:144` requires published+live; read-model visibility tests | Direct DB/public read expectations, suspended seller stale cart, archived/suspended listing, external sync staleness, allowed area, atomic revalidation at reserve/commit. |
| T09 Founder/seller numbers agree with authority | `ports/owner-report-contract.ts:73` placed cohort; `owner-metrics.test.ts`; API admin refusal `api.test.ts:1478` | Independent ledger-vs-graph reconciliation, line-rounding mismatches, partial refund/short remittance, missing terms fail, zero vs missing cost, cohort vs posting-time labels, own-seller exports. Shared wrong classifier does not satisfy correctness. |
| T10 Provider outage / job retry / recovery | Provider port/startup tests; HTTP origin tests; no restore/real gateway evidence | Durable unknown payment state, signed inbox replay/order handling, worker lease expiry/backoff/retry budget, no lost notice or double effect, authenticated scheduler, timed PITR/restore + post-restore stock/money invariants, alerts received. |
| T11 Identity, role revocation and membership | `identity-repository.test.ts:135` revocation/expiry/wrong house; `:265` current operator role; OTP provider contract tests | Individual staff phone, shared contacts, explicit active membership, viewer/fulfilment deny writes, operator deny finance, secret rotation, CSRF/server-action boundary, shared rate limits, safe definer/grants. |
| T12 Concurrent lifecycle transitions | `ports/repository-contract.ts:159`, `:180`; DB state-edge tests; return expected-state contract `return-contract.ts:189` | Simultaneous confirm/decline/dispatch/cancel, exactly one transition/notice/shipment, immutable original actor/reason, retry replay/loser conflict and deadlock-safe ordering. |
| T13 External-channel separation | No implementation/tests | Same external order imported twice creates one seller-private fact; no fee/GMV/global customer merge by accident; deletion/purpose and market-benchmark boundaries. Deferred feature gate. |
| T14 Migration/backup safety | `db/src/lifecycle.test.ts`; `schema/gates.test.ts:71` fresh setup; policy-shape migration ledger tests; source file enumeration checks | Upgrade from prior version with representative history, crash between DDL/marker, concurrent runner, checksum mismatch, manual SQL preservation, restore permissions/definers, no unintended destructive generator diff. |
| T15 Catalogue/variant/content evolution | Publish/parity/revision/content RLS/image tests already exist | Actual atomic product revision insertion on material edits; multi-brand selector/read model, stable variant backfill with existing order IDs, no same-name auto-merge, public draft/English-only image policy, same-page revision pointer, migration compatibility. |

## 5. Monitoring and operational readiness

Separate **stock availability** (can valid units be reserved now?) from **service availability** (can customers/sellers complete requests?). A positive count or an uptime homepage ping proves neither end-to-end order safety nor database recovery.

| Signal / control | What evidence is required | Current readiness |
|---|---|---|
| Stock conservation | On-hand/reserved/movement/reservation reconciliation; negative/overallocated counts zero; ageing expiry | NOT IMPLEMENTED |
| Money conservation | Unbalanced postings zero; duplicate event/claim count zero; refund ceilings; statement/receipt mismatch queue | NOT IMPLEMENTED; current arithmetic checks insufficient |
| COD cash conversion | Expected vs received vs fees, by actual collector/owner/period; unmatched remittances | Mutable fields only; no certified amount-aware reconciliation |
| Durable jobs | Queue age, oldest event, attempts/leases/dead letters, scheduler last success, notice delivery | NOT IMPLEMENTED |
| API/database health | Error/latency by checkout and seller action, pool budget/connections, lock waits/deadlocks, timeouts and resource use | Correlation/JSON logging implemented; real reporter/alerts and measured baseline UNVERIFIED |
| Query/index health | Representative EXPLAIN/load, actual optional pg_trgm presence, FK/tenant/time query indexes, storage/vacuum | Static indexes inventoried; no query plans/volume evidence |
| Retention/privacy | Per-class policy, completed purge/export/delete runs, privacy due dates, KYC access logs | Tables/functions partial; scheduler/process missing |
| Backups/recovery | Verified scheduled backup/PITR, isolated timed restore, recorded recovery point/time, stock/ledger/role validation | UNVERIFIED; plans only |
| Release safety | Known git revision, schema checksum/ledger, safe role/grants, backwards-compatible migrations and rollback exercise | No git metadata here; custom runner drift and recovery gaps |

Define and approve thresholds after a measured baseline; don't invent an achieved uptime percentage or recovery promise. Assign named alert/incident owners and escalation hours. Exercise provider-down and database-restore paths before promising availability to real sellers. Real SMS, error reporting, storage configuration and startup guards must agree on the actual injected adapters.

## 6. Founder / legal / PSP decisions still outstanding

| Decision | Precise question / accountable approval | Why it blocks development or launch |
|---|---|---|
| D-4 / rounding | What seller/source fee rates, minimum/subscription model, fee tax/discount base, rounding grain and effective-date/approval rules? Both founders + accountant | Configured defaults are not approved negotiated terms; line rounding must be stable. |
| D-5 / L14 / DR-03 | Who collects/holds COD/card cash; invoice seller or pay seller; who remits fees; what manual pilot handling is authorized? Founders + counsel/PSP/accountant | No automatic funds flow until authority and opening balances clear. DR-03 is OPEN. |
| Reserve/dispute/cadence | Which snapshotted return/reserve/dispute periods; when eligible/posted/transferred; two-person authority and thresholds? Founders/LEGAL/FIN | Eligibility and approval cannot depend on mutable seller settings. |
| DR-02 attribution | Branded search/copied link priority, unknown handling, windows, proof/dispute retention? Both founders/LEGAL | Existing resolver defaults cannot substitute for commercial agreement. |
| Staff policy, distinct new ID | Named role permissions, sign-in phone identity, multi-house membership/active-tenant selection, suspension handling? Founders/security | Existing S-1 references conflict; don't silently change security-critical architecture. |
| D-2 / ADR-08 | When customer phone possession is required at checkout/lookup/review/return, manual fallback and risk friction? Founders/LEGAL | Guest knowledge factors permit impersonation; stored delivery proof alone is insufficient. |
| Inventory policy | Reserve timeout/extension, COD lifetime, consume point, safety stock, inspected return restock, external sync freshness? Product/OPS + founders | Needed for deterministic concurrency/expiry; backorders/preorders remain off unless explicitly approved. |
| Partial outcomes / C-1/C-2 | Quantity-specific cancellation/refund, shipping/fee/discount bearer, courier shortage/refusal responsibility? Founders/LEGAL/FIN | DB cannot choose economic liability on behalf of contracts. |
| Category / L7/L8 | Permitted fragrances/claims/evidence, inspired-by/reseller status and return exceptions? Counsel + founders | Brand mapping and catalogue controls must reflect lawful operating scope. |
| A-1 / L10–L13 | Lawful analytics/KYC/customer/session retention, purpose, rights process and cross-border processing? Counsel/data owner | 180-day proposal/function is not executed retention or legal sign-off. No new anonymous→phone join by default. |
| A-2 costs | Actual PSP/COD/courier/support/promotion/affiliate/fraud cost evidence and allocation? FIN/business founder | Margin/CAC unavailable until applicable costs complete. |
| Metrics/cohorts | Gross vs net earned GMV, posted revenue series, refund periods, repeat cohort maturity/eligibility and cross-brand horizon? Business founder/FIN/DATA | Definitions versioned before implementing new dashboards. |
| ADR-04/11/14 and availability | One scheduler, real SMS/error vendor, recovery objectives, tested backup and incident staffing? Technical founder + cost owners | Core notifications/expiry/recovery cannot remain promises. |
| External channels / benchmarks | Do sellers want external sales/CRM, whose customer data is it, permitted reuse/benchmarking, consent and deletion responsibilities? Founders/LEGAL | DEFER until opt-in contracts and privacy-safe scope; never include these sales in marketplace GMV. |
| Sequencing | Approve bringing stock/security safety ahead of unrestricted pilot; approve listed new findings as tasks? Both founders | Existing P3 prerequisites/DR-15 do not automatically authorize reordered implementation. |

These are questions to record, not permission requests that halt this completed audit. No answer is assumed and no existing decision was edited. Qualified counsel/PSP, not this technical review, determines legal or licensed funds-handling questions.

## 7. Readiness decision and handoff

**Current:** strong reusable schema/domain/RLS foundations; materially incomplete commerce safety; production startup intentionally refuses configured stubs. No evidence of a launched/recoverable deployment or freshly passing full suite was obtained. The seven requested artifacts form a **reviewable foundation**, not an already-approved implementation plan.

**Before first real order:** complete the stage-0/1/2/3 safety gates and reliable notices/support/reconciliation/recovery; approve the lawful pilot policies and any manual money exception; keep software payout disabled. **Before software payout or financial reporting certification:** immutable terms/evidence, once-only balanced settlement, partial refund allocations and opening balance reconciliation. **Before electronic payment/courier automation:** provider idempotency/webhooks/outage gates. **Later:** normalized variants, warehouses, seller BI expansion, external CRM, loyalty and AI according to evidence gates.

Precise next proposed PR is **DB-SAFE-01: seller-owned brand integrity + seller-denied COD money fields**, followed by **P1.2.4: idempotent placement + locked transitions**. See report 06 for narrow scope, approvals and non-destructive migration gates. Neither is started here.
