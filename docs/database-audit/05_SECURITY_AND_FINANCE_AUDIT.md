# DIYAR — security and financial correctness audit

18 October 2026. **Not ready for real-money launch.** This is a source-based audit, with concrete follow-up tests, not evidence that attacks were executed or that production data was exposed. Read report 01 for confidence labels and runtime limitations. F01–F22 are stable finding identifiers for this review; they do not silently replace the canonical debt register.

## 1. Controls worth preserving

- Seller parent-order denial and own-sub-order traversal exist in SQL (`0002_rls.sql:174`). Fulfilment contact/address snapshots live on sub-orders (`0004_sub_order_delivery.sql:32`), avoiding a seller join to another seller's purchase graph.
- Owner-only payout SELECT policies exist (`0002:207`). API statement lookup includes both payout ID and authenticated seller ID (`repositories.ts:640`).
- Phone/email seller contacts were moved into private `seller_contacts` in 0026; identity reads use 0027 and transaction-scoped repositories. Existing negative join tests are `sellers-contact-columns.test.ts:103`.
- SQL review trigger checks delivered sub-order, line membership, product and buyer consistency (`0015_aftercare.sql:145`); unique review per line and no seller mutation policy prevent ordinary seller removal of criticism.
- Audit, sub-order transitions, product revisions and consent are protected by append-only statement triggers (`0001_constraints.sql:222`). Keep these protections when evolving financial records.
- OTP storage locks verification rows and consumes successful codes (`0025_login_codes.sql:182`); sessions are revocable and rechecked (`identity-repository.ts:92`). Signed cookies use audience-specific secrets.
- Payout execution defaults disabled in production (`payout-switch.ts:65`) and the procedure refuses before database work (`platform.ts:138`). Startup rejects stub OTP, local media and log-only error reporter (`instrumentation-node.ts:29`).
- Money is represented as integer piastres in source/DDL and a checked value object (`money.ts:34`); this is a sound basis, but not proof that all stored aggregates or rounding agree.

Evidence shorthand: `repositories.ts`, `owner-report-repository.ts`, `listing-repository.ts`, `return-repository.ts` and `identity-repository.ts` mean `packages/db/src/`; numbered SQL means `packages/db/migrations/`; `schema/` means `packages/db/src/schema/`; router/provider/trpc files mean `packages/api/src/`; `cart.ts`, `place-order.ts`, `settlement.ts`, `money.ts` and insight computations mean the corresponding `packages/domain/src/` subfolders. Explicit web paths override these abbreviations.

## 2. Tenant and authority boundary

All 39 application tables specify ENABLE/FORCE RLS through migrations. `schema_migrations` is a separate ENABLE-only infrastructure ledger. The main connection can be privileged, but request work calls `SET LOCAL ROLE app_user` after setting GUCs (`repositories.ts:787`). `app_user` is NOLOGIN with SELECT/INSERT/UPDATE/DELETE on public tables and EXECUTE on app functions (`0002:310`). Policies are generally permissive and share that SQL role. They use an asserted `app.actor_role`/`app.actor_id`, not an authenticated database principal.

This is a trusted-backend model: HMAC session verification → active database session → server-resolved IDs → transaction context → RLS. It is **not safe to give a seller, BI client or arbitrary SQL console an app connection and expect those editable GUCs to authenticate them**. `NOLOGIN` and `SET LOCAL` limit connection/context handling; they do not make a custom setting unforgeable. Direct SQL injection or a leaked privileged application connection can violate the model. There is no claim here that a public API accepts a raw role or SQL string.

PostgreSQL documents that superuser/BYPASSRLS bypass policies and that permissive policies combine with OR. FORCE does not constrain a superuser. Reference: [PostgreSQL row security](https://www.postgresql.org/docs/18/ddl-rowsecurity.html). Test with a nonowner, non-BYPASS login as well as PGlite, and verify memberships, schema permissions, function owners and exposed schemas before deployment.

### Role/access assessment

| Actor | Existing allowed scope | Gap to resolve |
|---|---|---|
| Anonymous API | Public catalogue/read models, guest placement and aftercare by factors | Projections constrain external response; raw SQL public policies expose entire admitted rows. No database credential may be issued to browsers. |
| Seller owner | Own sub-orders/lines/listings, contacts/checks/staff, own payouts | Several tenant relationships lack DB consistency constraints; owner SQL can alter seller commercial/status fields and shipment remittance. |
| Manager/fulfilment/viewer | Payout SELECT restricted by owner check | Most catalogue/sub-order/shipment writes have no finer staff-role guard. Viewer must not mean general seller mutation. |
| Platform operator | `app.is_platform()` blanket table policies; work queues and money procedures | `platformProcedure` does not distinguish delivery operator from finance/admin; insights admin-only check does not protect all finance paths. |
| Platform admin | Admin insights plus normal platform authority | No durable distinct two-person financial approval flow; self-modifiable platform membership under broad SQL role is unsafe for direct DB/BI access. |
| Checkout service | Broad customer/order graph read/write plus handoff | Endpoint WHERE predicates protect lookup; service role is not row-bound to a single supplied order. Documentation saying only its newly written rows are readable is too strong. |
| Aftercare service | Broad order/customer/catalogue/return/review/support reads and inserts | Every public operation must validate reference+phone before returning data; the service-role RLS does not authenticate the guest. |
| Intake/analytics/identity | Narrow purpose-based policies/functions | Context remains a trusted server assertion. Identity can read all relevant contacts/staff/session rows; do not confuse a repository predicate with row-specific identity-role RLS. |
| BI/export | No implemented reporting role or seller mart | No direct connection/privileged materialized view should be opened as a shortcut. Use scoped API read models first. |

## 3. Findings and concrete proof scenarios

### F01 — Repeated payout creates duplicate settlement claims (P0)

`platform.runPayout` reads **all** sub-orders for the seller, builds a statement and saves a fresh header (`platform.ts:146`, `repositories.ts:580`, `:598`). The only line uniqueness is `(payout_id, sub_order_id)` (`schema/money.ts:84`). There is no exclusion of previously paid/allocated entries, event-level financial ledger, payout execution key, or persisted immutable claim. `periodStart` is recorded but does not constrain `listForSettlement`.

This path writes statements; it does **not itself call a bank transfer provider**. The exact confirmed defect is duplicate payable statements/claims, from which repeated manual/automated payments could follow. Production default disabling is a real mitigation, not a repair. An explicit environment `true` reopens the path.

**Reproduction to add:** deliver/remit a mature sub-order, enable the path in an isolated fixture, run the same payout twice and concurrently. Assert one immutable settlement claim and one payable allocation, then verify a retry returns the original result. Current code has no such uniqueness. Existing `payout-switch.test.ts:13` tests the guard; it does not prove exactly-once settlement.

### F02 — A recorded refund does not reverse financial truth; partial-refund safety absent (P0)

`returns.resolve` checks case state, writes `refund_piastres` and an audit entry (`routers/returns.ts:274`, `return-repository.ts:215`). It does not execute a refund, record payment confirmation, move the sub-order to returned, allocate returned/refunded quantity, or post a reversal. The operational sub-order can stay delivered and earned. Refund validation imposes a generic 10,000,000-piastre cap, not the remaining refundable value of that purchased line/order.

The domain has a whole-sub-order reversed calculation, but persistence rejects nonzero commission on a returned sub-order (`0001:290`). No migration replaces that trigger. A negative full-sale reversal is also not a substitute for a quantity-specific refund. Refunds need evidence of success and bounded allocations across merchandise, shipping, discount and fee bearer, including returns before initial settlement.

`returnRepository.request` uses `NOT EXISTS` (`:164`) but no UNIQUE constraint protects a line from two simultaneous requests. Its sequential contract test does not establish concurrency safety. Return policy is read from the **current product** (`return-repository.ts:115`), not the purchase-policy snapshot.

**Tests:** two-house order, three units in one line, return one unit, refund once, retry and refund remaining units; the other house remains unchanged. Total refund never exceeds captured/collected refundable amount. Return received alone is not refund success. Before-settlement return must not create a negative payable without an earlier accrual; after-settlement refund writes a bounded reversing transaction. Existing `aftercare.test.ts:232` proves recorded amount/audit only.

### F03 — No stock reservation/decrement; duplicate lines bypass stock cap (P0)

`CartPricer` iterates each requested line and separately applies `min(stock,10)` (`cart.ts:135`, `:166`). It does not aggregate repeated product IDs. `orders.place` accepts an array without distinct-ID validation (`orders.ts:74`). `orders.save` persists items but never reserves or decrements stock (`repositories.ts:293`). There is no reservation/movement/balance schema.

**Deterministic source scenario:** one published/live product has stock 1; send the same product twice with quantity 1 each. Both iterations are accepted, no quantity reduction adjustment arises, and the order contains 2 units. Concurrent customers or sequential new orders also read the same unchanged stock. `stock >= 0` CHECK cannot protect a value nobody changes.

**Tests:** duplicate-ID aggregation; two independent SQL connections competing for one unit; release/consume/expiry exactly once; seller adjustment racing reservation; inspect return before restock; block seller/listing even with positive stock. Existing cart tests cover per-line caps, not this invariant.

### F04 — Checkout retries are not idempotent (P0)

`orders.place` creates a new random reference for every request (`orders.ts:171`), accepts no request key and has no unique persisted checkout command. A transaction prevents half an order, not a second complete order after a lost response. Phone rate limiting permits multiple legitimate retries; it does not identify the same purchase.

**Test:** same scope/key/hash concurrently and after simulated response loss returns one existing order/result. Reusing the key with a changed basket/contact/quote must fail. Different keys remain independent. Retention of request/result must cover the documented retry window. Add tests before modifying P1.2.4.

### F05 — Race-prone transitions and incomplete cancellation/refusal writers (P0)

`applyTransition` SELECTs current state without a lock, validates then UPDATEs by ID alone (`repositories.ts:531`–`:559`). The SQL trigger returns immediately on same-state update (`0001:258`). Two confirmations can both read awaiting_seller, write confirmed and append duplicate transition facts. Dispatch can insert multiple shipments before this check; there is no shipment command identity.

The DB state trigger validates edges but not actor/reason/record consistency. Seller SQL can move dispatched→delivered under broad own-row UPDATE policy despite the domain prohibiting that actor; the seller API currently does not expose this operation. Cancelled/refused exist in domain/SQL but have no customer/operator procedure. Return case updates do use expected-state conditional UPDATE (`return-repository.ts:233`), a useful pattern to preserve.

**Tests:** competing confirm/decline, duplicate confirm/dispatch, operator/customer cancellation against dispatch, explicit reason validation at persistence boundary, one resulting timestamp/event/shipment, loser receives replay or conflict. Avoid a blanket unique(suborder,to_state) design that blocks future legitimate lifecycle revisions; use event/command IDs.

### F06 — Remittance timestamp is treated as full cash proof; amount and authority unsafe (P0)

`recordRemittance` accepts any nonnegative integer and UPDATEs all shipments for a sub-order (`platform.ts:80`, `repositories.ts:571`). `settlementFacts` considers **any shipment with nonnull remitted timestamp** sufficient (`owner-report-repository.ts:61`–`:82`); it neither reads amount nor expected total nor verifies cash owner. A recorded zero or partial remittance can make full merchandise eligible after reserve. Multiple shipments compound this weakness.

Additionally, `seller_manage_own_shipments FOR ALL` (`0002:196`) has no guard freezing `cod_collected_piastres`/`cod_remitted_at`. A seller with arbitrary SQL under the asserted seller context could forge remittance on its own shipment. Ordinary seller API only accepts a tracking number, so this is a database least-authority failure, not a demonstrated browser exploit.

**Tests:** zero/short/excess remittance, repeated external remittance ID, allocated multi-shipment remittances, fee deduction, seller-collected COD invoice model versus platform-collected payout model. Seller cannot set COD proof; shortage becomes an exception, not full earned cash.

### F07 — Attribution evidence is unwired and transient decisions are discarded (P0 before fee differentiation)

The router always supplies `touches: []` (`orders.ts:180`), so ordinary checkout resolves unknown. `PlaceOrder` computes per-sub-order reason/windows/considered touches (`place-order.ts:162`) but the repository writes only order-wide `source` and line rate/source/version, not decision evidence/windows or touch rows (`repositories.ts:219`, `:304`). The order-wide source represents the largest sub-order, not every seller.

**Tests:** verified storefront, paid, creator, direct repeat, ambiguous/expired/future touch and mixed-house basket. Persist enough versioned evidence to replay each decision. Unknown remains unknown; never infer marketplace acquisition from customer registration or silently reclassify history. DR-02 and windows/dispute terms require founders.

### F08 — Default rules, line-rounding mismatch and current-term drift (P0)

`PlaceOrder` constructs default `CommissionPolicy` (`place-order.ts:135`) instead of reading `commission_rule_sets` and overrides. `settlementFacts` puts lines in a map keyed by sub-order, keeping whichever line is last, then returns that one line's source/bps (`owner-report-repository.ts:59`). Settlement/reporting multiply the whole merchandise by that bps rather than summing saved `commission_piastres` (`services/settlement.ts`, `owner-metrics.ts:280`).

Even equal rates can disagree by rounding: two 10-piastre lines at 500 bps snapshot 1+1=2 piastres; applying 500 bps once to 20 piastres yields 1. This is an arithmetic witness, not a runtime test. Mixed line rates become more wrong. Missing lines fall back to unknown/zero bps rather than raising a completeness error. Reserve/dispute days are loaded from current seller rows (`platform.ts:154`, `owner-report-repository.ts:129`), so later edits can rewrite eligibility/deadlines for old orders.

**Tests:** odd-piastre multi-line totals, distinct line policies if supported, changing current rate/reserve after purchase, missing line evidence fails closed, distinct effective-time intervals and version provenance. Historical snapshots remain authoritative; any changed rounding policy is versioned and approved.

### F09 — RLS row scope is useful but public-field and relationship integrity remain incomplete (P0)

`public_read_live_sellers` admits entire live seller rows (`0002:115`). Those rows still contain `owner_name`, `legal_name`, `escalation_contact`, `privacy_contact`, `application_note` and commercial terms (`schema/sellers.ts:17`–`:56`). Public product/review policies likewise admit whole rows, including stock/compliance/moderation fields or buyer/order identifiers. The API projects subsets; no raw database public endpoint was verified. Moving phone/email fixed the specific old defect, not all field classification.

`products.seller_id` and `brand_id` are independent FKs (`catalogue.ts:37`), with no matching seller invariant. A public competitor brand can be referenced by a seller's draft if its ID is known. `newListingSchema` accepts a brand UUID and `listingRepository.create` stores it; no demonstrated server-side ownership check. Similarly line product seller vs sub-order seller and payout-line sub-order seller vs payout seller are not FK-enforced. A trusted/wrong writer can create cross-tenant graphs. Global unique/FK errors can also reveal existence; return uniform API errors where appropriate.

**Tests:** public columns/joins/JSON whole-row reads against canary private values; seller A creates listing under B's public brand; cross-seller line or statement insertion is refused independent of UI. Review public projections avoid customer/order IDs. Build explicit public read models or separate tables/column grants appropriate to the connection roles.

### F10 — Staff identity and authorization are not ready for independent multi-user operation (P0 for that scope)

Seller sign-in matches `seller_contacts.contact_phone` then selects the first active staff row without role/order/person-phone restriction (`identity-repository.ts:29`). This is not individual staff authentication. Multiple sellers may share contact phone (nonunique index) and one auth ID may belong to multiple sellers (`seller_staff_unique` is composite). SQL `app.staff_seller_id()`/`staff_role()` use `LIMIT 1` without selected seller context (`0002:39`). A session's seller ID and RLS-selected seller can disagree in that future case.

`sellerProcedure` checks actor and seller ID but no staff permission (`trpc.ts:218`); most RLS writes also omit role restrictions. `platformProcedure` admits any platform actor (`:226`), so ordinary operator can record remittance/run payout when enabled. Only insights explicitly requires admin (`routers/insights.ts:34`). No two-person payout approvals exist.

**Tests:** individually authenticated owner/manager/fulfilment/viewer, shared contact collisions, multi-seller membership with explicit active tenant, revoked/suspended principal, operator unable to approve/payout/change rates, two distinct authorized approvers. Record a new unambiguous staff-policy decision: S-1 is inconsistently used in existing docs.

### F11 — Electronic payment/webhook resilience is only a schema/port starting point (P1 before enabling)

`PaymentGateway` has only `authorise` (`providers/ports.ts:56`); current checkout directly imports real COD adapter. Orders have payment enums/ref but no writer for captured/failed/refunded states in production flow. `webhook_events` has provider/event uniqueness but no authenticated handler, processor lease or out-of-order logic. `gates.test.ts:476` tests uniqueness of inbox insertion, not safe processing or double-charge prevention.

Add intent/attempt/immutable transaction/refund contracts and a registry/adapters at the composition root, without putting vendor secrets or PAN/card data into DB/logs. Unknown outcome after timeout must remain reconcilable, not be guessed failed and charged again. PSP/legal D-5/L14 approval precedes funds flow.

### F12 — No durable outbox, expiry/purge scheduling or business notifications (P0)

There is no production outbox/job ledger/runner. `outboxOtpSender` writes a dev test file (`providers/stubs.ts:103`), unrelated to a transactional delivery queue. Order handoff changes state without real seller notification (`orders.ts:214`). Analytics purge exists in SQL (`0023:81`) but no scheduler calls it; session purge is absent. In-process fixed-window rate limits are instance-local (`rate-limit.ts`).

**Tests:** commit/rollback outbox agreement, duplicate worker execution, expired lease recovery, retry/backoff limits, SMS outage, reservation expiry, scheduled retention and privacy completion. Job endpoint must authenticate; source/log payloads must omit OTPs/PII except approved sender/test boundaries.

### F13 — Owner report is an operational cohort, not certified revenue accounting (P0 for money claims)

The repository selects orders by **placement time** (`owner-report-repository.ts:100`), then classifies their current sub-order state as of now with current reserve policy. This is a valid labelled placed-cohort operational view, not earned-in-period or posted-revenue flow. Late remittance/returns and older-order refunds will not behave like a cash/accrual ledger.

GMV/revenue use earned-only current state (`owner-metrics.ts:229`, `:284`) and do not net recorded refund successes. Refund amounts with platform bearer are summed without restricting refunded status (`owner-report-repository.ts:158`). Source/rate fallback and remittance weaknesses contaminate the same dashboard and payout consistently; agreement alone is not correctness. Missing costs are deliberately marked not_recorded and margin withheld—KEEP this good behavior. See report 07 for exact definitions.

### F14 — Availability, backups and real PostgreSQL security are unverified release gates (P0)

Connection pooling and production startup checks are implemented (`connect.ts:65`, `instrumentation-node.ts:29`). No evidence establishes a deployed topology, WAL/PITR, recovery drill, alert delivery, capacity, database TLS settings, connection role ownership or measured RPO/RTO. Plans in `docs/architecture/10-infrastructure.md` are not operational evidence. The supplied folder lacks git history and installed dependencies.

Require a timed restore and post-restore reconciliation on an authorized sanitized environment, real-Postgres tenant tests, measured pool budget and outage exercises. PostgreSQL offers different [backup/recovery mechanisms](https://www.postgresql.org/docs/18/backup.html); provider configuration and successful restoration must be evidenced separately. Approve actual objectives rather than borrowing the draft's numbers as achieved SLOs.

### F15 — Schema constraints cover local arithmetic but miss important integrity (P0 money/security, P1 remaining)

Order total and line multiply CHECKs exist, not cross-table totals or line commission arithmetic (`0001:23`). No unique(order_id,seller_id), no FK from snapshotted rule version to rules, no positive/nonnegative checks on every financial field, no bounded refund allocation. `commission_overrides.bps` has no range CHECK.

`rule_set_two_approvers CHECK(array_length(approved_by,1)>=2)` (`0001:52`) accepts an empty array because the expression is NULL, and two repeated strings are not two people. Current rule sets are mutable under platform policy. A session trigger prevents UPDATE except revocation, but platform ALL still permits DELETE (`0028:125`); don't repeat the comment's universal no-delete guarantee. Seller verification gate checks UPDATE, not direct inserted live rows; platform/intake protections must be understood at their own boundary.

Add event/tenant/amount/range invariants with staged validation. Inspect all legacy anomalies before enforcing new constraints; do not fabricate values to force validation.

### F16 — Harden SQL role/function trust before database or BI exposure (P0 deployment boundary)

Early SECURITY DEFINER helpers (`0002:39`, `:58`, `0007:63`) and OTP/purge functions lack a pinned safe search path and use unqualified table names. Execute grants/default privileges are broad (`0002:317`). Function owner and public/temp schema privileges are UNVERIFIED. An attacker with object-creation/SQL capabilities could exploit the wider environment; no such capability is proven for an ordinary browser user.

Fully qualify dependencies, use a reviewed trusted search path with temp last, restrict EXECUTE to service purposes, and verify function ownership rather than assuming FORCE protects the definer. Use separate narrow migration/runtime/reporting identities and do not rely on a privileged pool plus editable GUCs for arbitrary client SQL. Guidance: [PostgreSQL SECURITY DEFINER precautions](https://www.postgresql.org/docs/18/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY).

**Tests:** role escalation attempt by changing GUC, untrusted search-path/temp shadow, direct function calls as public/seller/reporting, failed transaction/context reuse, pooler transaction isolation and break-glass audit. No test result is claimed here.

### F17 — Guest factors are knowledge, not verified possession; OTP hardening remains (P0 policy)

Guest lookup/review/return require order reference + phone (`orders.ts:267`, `reviews.ts:101`). A seller knows its recipient phone and sub-order reference and can often derive the parent reference. Without customer phone-possession verification, delivered-purchase association does not prove the reviewer is the customer. Retain strict line/product/customer matching; add approved possession proof for protected aftercare.

OTP digest is SHA-256 of a small code+phone (`providers/session.ts`, 0025), not a keyed digest; a leaked digest can be searched over the code space within validity. `verify_login_code` takes max_attempts from caller and does not validate a hard DB ceiling (`0025:169`). Console/outbox sender intentionally logs real dev OTPs, refused in production. Add a server-keyed digest/rotation design if threat model warrants it, fix service privilege/attempt bounds, canonicalize phone consistently, and avoid logging credentials in deployed environments. Vendor, checkout verification friction, retention and recovery policy require approval.

### F18 — Migration/generation paths can diverge; release crash recovery incomplete (P0 release)

Custom `applyMigrations` enumerates all SQL files with contiguous numbers, but executes DDL and migration-ledger insertion as separate calls (`migrate.ts:138`, `:141`). It has no checksum or concurrent-run lock. Crash between calls can leave applied DDL without a ledger marker; retry may fail. A plain `SqlExecutor` cannot read prior ledger rows and so replays all. Final ledger REVOKE errors are swallowed (`:154`). No live failure was induced.

`migrations/meta/_journal.json` contains only 0000, while `packages/db/package.json` exposes `drizzle-kit migrate`; the schema also omits several SQL-only FKs/defaults/index predicates. A generated diff or alternate migration runner may skip or recreate manual changes. Preserve all existing SQL history; establish one reviewed release path, checksum/lock and atomic DDL+marker strategy, with explicit nontransactional-index exceptions. Test interrupted/resumed application on a disposable clone later. Never run dev seed against a deployed database to solve drift.

### F19 — Product/brand extensibility should evolve the existing listing model (P1/P2)

`products` is deliberately seller-scoped (`schema/catalogue.ts:6`), carrying scent/variant/price/stock in one row. `master_product_id` has no FK. Seller→many brand rows is already possible, but `myBrand` and storefront readers select first brand (`listings.ts:59`, `catalogue-read-model.ts:132` area). No seller→shared brand permission mapping, canonical perfume/variant identity or normalized note relationship exists.

Preserve listing IDs, add optional canonical perfume/variant IDs and a controlled backfill, and change multi-brand reads only after policy approval. Do not create a duplicate `seller_listings` table or rebuild orders. Multiple warehouses, gifts/bundles and external-channel CRM stay later capability gates.

### F20 — CMS publication boundary has draft and English-media gaps (P1; private drafts P0)

Public live-page RLS admits whole `content_pages` rows including `draft_blocks`/English drafts (`0009:146`, `schema/content.ts:32`). API live reads use published revisions, so this is a raw-SQL boundary gap. Content-image public RLS tests only served `r.blocks`, not `blocks_en` (`0022:65`), so an English-only image lacks the corresponding metadata visibility. Revision pointer FK does not enforce matching page ID. Immutability trigger forbids UPDATE only; historical unserved revisions can be deleted by platform SQL.

Add safe served-public projection, language-union visibility and same-page pointer consistency tests; preserve editorial revision history. No schema move is needed.

### F21 — Repricing protects server totals but not the customer's last accepted price/ETA (P0)

Cart pricing can detect `seenPricePiastres` (`cart.ts:180`), but checkout action forwards only product IDs/quantities (`apps/web/src/features/checkout/actions.ts:60` area). `orders.place` has no accepted quote/version/seen-price input. A price changed after the summary was read can be used in the order without a `price_changed` adjustment. The router comment that all price changes are refused overstates this protection.

Also a seller group's shipping preparation uses the first product's fulfilment hours (`cart.ts:133`, `:222`), not necessarily the slowest line. Test two lines with 24h/72h lead times in both input orders. Use an approved quote expiry/version and max required preparation where shipments are combined; reject changed accepted economics, then require the buyer's acknowledgement. Do not trust arbitrary browser totals.

### F22 — Product material changes have no revision writer (P0 before live seller edits)

`product_revisions` is an append-only table (`schema/catalogue.ts:136`, `0001_constraints.sql:237`), but `listingRepository.update` overwrites current fields (`listing-repository.ts:149`, `:188`) without inserting a before/after revision. No production INSERT/reference to `productRevisions` was found outside its schema; a repository-wide source search also found no SQL history-population trigger. Stock, price, formulation and fulfilment edits therefore lack the promised product revision provenance. An append-only table cannot audit events never inserted into it.

Populate the existing table in the same transaction as material changes, with immutable actor/time/changed-field values and controlled evidence. Protect concurrent edits against stale before-images; capture only appropriate fields and avoid copying secrets into audit payloads. Test a price/stock/notes change produces one revision, failed update produces none, retry no duplicates, and buyer historical line snapshots remain unchanged. A separate listing_price_history table is unnecessary until proven requirements demand it.

## 4. Evidence and reproduction discipline

All scenarios above are specifications for **future isolated fixture tests**. They must not be run against production/staging customer data under this audit authorization. Existing suites typically create in-memory PGlite and apply all migrations, so they were deliberately not executed. The source guard passed after a sandbox path-resolution failure was resolved through the tool's explicit approval path; it found no hardcoded-color or direction violations. That result says nothing about financial correctness.

Prioritize tenant privacy, valid order commitments, bounded money and recoverability. A shared classifier, an ERD, a green old test log, or a correct arithmetic equality cannot independently establish those invariants.
