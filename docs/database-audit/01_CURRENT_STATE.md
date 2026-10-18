# DIYAR database audit — current state

**Audit date:** 18 October 2026 (Africa/Cairo). **Verdict:** preserve the modular monolith and shared PostgreSQL model; do not launch real commerce on the current money/inventory paths. **Status:** audit/design recommendation for review, not an approved migration or certification of a deployment.

## 1. Evidence boundary and method

The attached `CODEX_MASTER_PROMPT.md` was read in full before the architecture review. All four proposed architecture inputs were read, including the complete blueprint. They are hypotheses and comparison inputs. Repository implementation, ordered SQL, code consumers and tests establish the code state. Historical handoff snapshots and September audits do not establish current implementation.

Inspected the 39 Drizzle application tables, all 32 numbered SQL migrations (`0000`–`0031`), migration executor, repositories, domain rules, API boundaries, relevant web authentication/actions/composition roots, test cases, CI, and decision/debt/architecture records. The application also creates the infrastructure table `schema_migrations` through `packages/db/src/migrate.ts:84`, so the code-defined database has **40 tables including that ledger**, not 40 business tables. SQL-only relationships and protections are included below. Other schemas/extensions/provider-managed tables are UNVERIFIED.

`git status --short`, `git branch --show-current` and `git rev-parse HEAD` each returned **not a git repository**. This supplied folder has no `.git`; branch, revision, tracked/untracked state and remote history are UNVERIFIED. Do not manufacture a commit identifier. A source fingerprint is recorded in the generated appendix.

No database was opened, queried, seeded or migrated. No production/staging data, credentials or customer PII were accessed. No dependency installation, deployment, branch, PR, application edit or commit was performed. The SQL supplied in the ZIP was read as reference material only. Dependencies are absent (`node_modules` absent at root and web), so no Vitest, typecheck, build or browser suite was run. Existing tests are **read evidence**, not passing results from this audit. The fresh read-only guard result is recorded in section 12.

Confidence labels throughout the seven artifacts:

- **IMPLEMENTED & VERIFIED IN CODE:** present in executable source/DDL and inspected; does not assert deployed behavior or fresh test success.
- **PARTIAL/BROKEN:** present but insufficient or disconnected from its required invariant.
- **DOCUMENTED ONLY:** requirement/plan without an implemented path.
- **PROPOSED:** this review's recommendation; no schema installed.
- **BLOCKED BY DECISION:** implementation would choose unapproved economics/policy/security/legal terms.
- **UNVERIFIED:** runtime, provider configuration, deployed grants, dataset contents, performance or operational evidence was not available.

## 2. Sources and contradictions

The user-authorized audit and handoff scope govern this work. Founding documents 01–06 preserve business intent; `DECISION_REGISTER.md` records decisions; `MASTER_EXECUTION_PLAN.md` sequences implementation. `CLAUDE.md` and engineering rules constrain boundaries. Actual code/ordered SQL govern what exists. Proposed ZIP designs and older snapshots cannot overwrite these sources.

| Conflict | Reconciled position and evidence |
|---|---|
| Documentation says roughly 25 tables / 26 migrations | 39 Drizzle application tables and 32 SQL files; additionally migration infrastructure ledger. See inventory below. |
| Supabase Auth or several web applications | Own phone OTP and database sessions; one web app. `apps/web/src/core/identity.ts:41`, `packages/db/src/identity-repository.ts:28`, root workspace manifests. |
| ADR-05 still says add sessions | Already implemented by migration 0028 and session revalidation. `packages/db/src/identity-repository.ts:92`. |
| ADR-10 still proposed / older docs say superuser reads | Catalogue and identity now go through scoped repositories. `apps/web/src/core/catalogue.ts:1`, `core/identity.ts:41`, `packages/db/src/repositories.ts:787`. Runtime credentials remain UNVERIFIED. |
| `pg_boss`/`pg_cron` chosen vs ADR-04 cron runner | Neither runner exists; ADR-04 is still Proposed. Do not install both mechanisms. `docs/architecture/03-architecture-decisions.md`, missing outbox/job tables and job routes. |
| Manual pilot money described as a decision | DR-03 remains OPEN in `DECISION_REGISTER.md:29`; production payout disabling is implemented. Recommend manual two-person settlement only after explicit commercial/legal approval; do not describe the recommendation as signed approval. |
| S-1 has two meanings | Root register S-1 is seller support inbox; debt #17 and P4.6.1 use it for staff roles. Create a distinct permission-matrix decision ID before implementation. `DECISION_REGISTER.md:58`, `MASTER_EXECUTION_PLAN.md:212`. |
| Earlier documents defer English | D-3 approved English; migration 0030 and middleware implement customer English. This review does not remove it. |
| Proposed ERD suggests a separate seller listing table | Current `products` explicitly means seller listing. Preserve its IDs; normalize scent/variant identity additively. `packages/db/src/schema/catalogue.ts:6`. |
| Proposed completed/earned label implies accounting finality | Current classifier is operational eligibility using current reserve terms and remittance timestamp; no posted financial ledger exists. `owner-report-repository.ts:68`, `settlement-classify.ts:37`. |

## 3. Implemented topology

One Next.js App Router application supplies marketplace, `/seller` and `/ops`. Six packages are `domain`, `db`, `api`, `i18n`, `tokens`, `ui`. Domain imports are framework-free; application orchestration remains in some tRPC procedures (debt #15). Web server actions call `createCaller`; anonymous HTTP tRPC is a separate transport over the same router (`packages/api/src/http.ts:139`, `apps/web/src/app/api/trpc/[trpc]/route.ts`).

PostgreSQL access uses Drizzle; a supplied `DATABASE_URL` selects postgres-js with `prepare:false`, pool max default 10 and timeouts; otherwise PGlite persists locally. `packages/db/src/connect.ts:51`. Schema deployment, database version, region, roles, replicas and backups are UNVERIFIED; naming Supabase in documentation does not verify a running Supabase service.

`DrizzleUnitOfWork.transaction` sets transaction-local `app.actor_role`, `app.actor_id`, optional request ID and then `SET LOCAL ROLE app_user` (`repositories.ts:787`). GUC actor strings are application assertions, not database-authenticated principals. Authenticated web paths derive IDs from verified signed cookies/session rows; direct SQL/BI use must not be granted arbitrary actor-setting authority. See security audit.

## 4. Capability truth table

| Capability | Current status | Evidence / practical boundary |
|---|---|---|
| Independent sellers, brands, public storefronts | IMPLEMENTED & VERIFIED IN CODE; multi-brand UI partial | `schema/sellers.ts:14`, `schema/catalogue.ts:23`; one seller can own many brand rows, each brand has one seller; `routers/listings.ts:59` selects first brand only. |
| Tenant-isolated seller orders and owner statements | IMPLEMENTED & VERIFIED IN CODE, permissions incomplete | `0002_rls.sql:176`, `:207`; seller must not read parent orders. Viewer/fulfilment mutation permissions are too broad; report 05. |
| Product catalogue, moderation, verified images, note glossary | IMPLEMENTED & VERIFIED IN CODE; product revision capture missing | 0010, 0021, 0024, 0030, 0031; product_revisions table is protected but listing updates do not populate it; arrays of note strings are not normalized note FKs; no variant aggregate. |
| Guest multi-seller COD checkout | IMPLEMENTED & VERIFIED IN CODE, unsafe under retries/stock pressure | `routers/orders.ts:95`, `repositories.ts:216`; one atomic graph, server pricing, no reserve/idempotency. |
| Confirmation, rejection, manual dispatch, delivery and remittance | IMPLEMENTED & VERIFIED IN CODE | `routers/seller.ts`, `routers/platform.ts:57`; no courier network booking/tracking integration. |
| Cancellation / refusal writers | DOCUMENTED ONLY for user/API workflows | Domain/DB transitions exist, but inspected routers have no procedures to produce those outcomes. |
| Return case progression / refund amount recording | PARTIAL/BROKEN financially | `routers/returns.ts:274`, `return-repository.ts:215`; no payment refund, sub-order outcome update, quantity allocation or reversal posting. |
| Payment gateways | COD implemented; electronic processing DOCUMENTED ONLY | `providers/stubs.ts:48` is a real COD authorization adapter; port has only `authorise`, not capture/refund/reconcile. No payment tables beyond order fields and webhook inbox shell. |
| Payout calculation and saved statements | PARTIAL/BROKEN | `platform.runPayout`, `repositories.ts:598`; no monetary transfer provider here, but duplicate payable statements/claims would permit duplicate manual settlement. Guard defaults off in production. |
| Attribution / negotiated commercial rules | PARTIAL/BROKEN | Domain resolver and snapshot columns exist; `orders.ts:180` sends empty touches; `PlaceOrder` uses default `CommissionPolicy`; DB rule tables are unused by production procedures. |
| Analytics | Operational admin report implemented; financial certification incomplete | `routers/insights.ts:29`, `owner-metrics.ts:222`; seller BI, warehouse/marts, repeat/CAC/cost ingestion absent. |
| OTP / revocable sessions | Durable storage and revocation implemented; SMS BLOCKED | 0025, 0028; sign-in uses house contact phone + arbitrary first active staff; real sender absent. |
| R2 media | Adapter implemented; live configuration UNVERIFIED | `providers/media.ts`, `apps/web/src/core/media.ts`; local media and error/SMS stubs block production startup. |
| Outbox, durable jobs, scheduled expiry/purge, notifications | DOCUMENTED ONLY | No such application tables/runner; OTP test outbox is a development file sink, not a transactional outbox. |
| Consent/privacy requests/webhook inbox | Schema implemented; operational workflows missing | Governance tables exist; no production writer/consumer found beyond declarations. |
| Backup/PITR/restore, HA and uptime | UNVERIFIED | Code supplies pooling and startup safeguards, not restore evidence or availability measurements. |

## 5. Independently rechecked historical issues

| Historical issue | Current verdict | Evidence and remaining exposure |
|---|---|---|
| C1 duplicate payout | STILL PRESENT, production default guard mitigates | `schema/money.ts:84` uniqueness only within one payout; `repositories.ts:580` loads all seller subs, `:598` writes new payout; no claim of prior settlement. `platform.ts:138` refuses when disabled. |
| C2 refund does not reverse | STILL PRESENT | `returns.resolve` changes case and audit only; settlement reads sub-order state, not refund facts. Existing completed-only payout trigger rejects nonzero fee reversal on returned state (`0001:290`). |
| C3 no stock reservation | STILL PRESENT | `CartPricer:166` caps a request line against a static count; order persistence never decrements/reserves; no movement/reservation table. Duplicate product IDs also bypass total-per-product cap. |
| C4 attribution always unknown | STILL PRESENT on ordinary checkout | `orders.ts:180` empty touches; resolver defaults to unknown, default 500 bps. Decision/windows/evidence in draft are not persisted by `orders.save`. |
| C5 hardcoded rates | STILL PRESENT | `place-order.ts:135`, `policies/commission.ts:47`; DB rule tables exist without a production loader/change workflow. |
| C6 unreachable cancelled/refused | STILL PRESENT at API/UI workflow level | Domain/DB contain transitions; only happy-path/rejection procedures exist. This does not mean raw SQL cannot set these states. |
| H1 repeated checkout duplicates order | STILL PRESENT | `orders.place` generates a new reference every request, accepts no idempotency key, and persists a new graph; rate limiting is not deduplication. |
| H13 transition race | STILL PRESENT | `repositories.ts:531` reads without lock, then UPDATE by ID at `:559`; same-state DB updates bypass transition guard (`0001:258`), allowing duplicate transition records after simultaneous confirmations. |
| Contact phone/email public exposure | FIXED IN CODE; residual public-field scope remains | 0026 moved those columns; 0027 supplies identity reads; `sellers-contact-columns.test.ts:103`. Other sensitive-looking seller columns remain on the publicly readable row. |
| Stateless, irrevocable staff session | FIXED IN CODE | 0028 + `identity-repository.ts:92`; tests at `identity-repository.test.ts:135`. |
| Missing dispatch clock / unverified image publish gate | FIXED IN CODE | 0020 snapshots dispatch window; 0024 checks verified media facts. |

## 6. Inventory interpretation

The generated inventory below lists every current Drizzle column, primary key and declared FK, followed by SQL-only FK corrections, migration introduction, current consumers, access profiles, named indexes and constraint/function evolution. Column definitions are reconstructed from current source; SQL migrations govern effective CHECKs, defaults and index predicates. No SQL catalog dump was obtained. Runtime drift, missing manually applied objects, actual `pg_trgm` availability and role grants remain UNVERIFIED.

All application tables are specified ENABLE + FORCE RLS by numbered migrations. Login-code table has no ordinary row policies; guarded SECURITY DEFINER functions mediate it. `schema_migrations` is ENABLE-only, not FORCED, with no app policies and a best-effort privilege revoke. The appendix must not be interpreted as permission to expose a SQL credential to sellers.

## 7. Full column and table inventory

Types below use SQL enum names. NULL/NOT NULL and defaults are from Drizzle; latest SQL overrides are called out in section 9. Identifiers without a real FK are not drawn as relationships.


### adjustments

Definition: `packages/db/src/schema/money.ts:89`. Introduced by `packages/db/migrations/0000_initial.sql:318`.

Financial-adjustment shell; owner-own read/platform management. runPayout passes empty adjustments.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/money.ts:90` |
| `seller_id` | `uuid` | NOT NULL | — | `sellers.id`; `packages/db/src/schema/money.ts:91` |
| `payout_id` | `uuid` | NULL | — | `payouts.id`; `packages/db/src/schema/money.ts:92` |
| `sub_order_id` | `uuid` | NULL | — | `sub_orders.id`; `packages/db/src/schema/money.ts:93` |
| `type` | `adjustment_type` | NOT NULL | — | —; `packages/db/src/schema/money.ts:94` |
| `amount_piastres` | `integer` | NOT NULL | — | —; `packages/db/src/schema/money.ts:95` |
| `reason` | `text` | NOT NULL | — | —; `packages/db/src/schema/money.ts:96` |
| `created_by` | `uuid` | NOT NULL | — | —; `packages/db/src/schema/money.ts:97` |
| `approved_by` | `uuid` | NULL | — | —; `packages/db/src/schema/money.ts:98` |
| `created_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/money.ts:99` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE INDEX "adjustments_seller_idx" ON "adjustments" USING btree ("seller_id");
```

### analytics_events

Definition: `packages/db/src/schema/governance.ts:69`. Introduced by `packages/db/migrations/0000_initial.sql:412`.

Seven anonymous browsing events; minimal analytics insert policy; platform raw reads; no seller reads. Product ID not FK; historical broad columns remain.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/governance.ts:70` |
| `name` | `text` | NOT NULL | — | —; `packages/db/src/schema/governance.ts:71` |
| `anonymous_id` | `text` | NULL | — | —; `packages/db/src/schema/governance.ts:72` |
| `customer_id` | `uuid` | NULL | — | `customers.id`; `packages/db/src/schema/governance.ts:73` |
| `seller_id` | `uuid` | NULL | — | `sellers.id`; `packages/db/src/schema/governance.ts:74` |
| `product_id` | `uuid` | NULL | — | —; `packages/db/src/schema/governance.ts:75` |
| `order_id` | `uuid` | NULL | — | `orders.id`; `packages/db/src/schema/governance.ts:76` |
| `source` | `text` | NULL | — | —; `packages/db/src/schema/governance.ts:77` |
| `campaign_id` | `text` | NULL | — | —; `packages/db/src/schema/governance.ts:78` |
| `payload` | `text` | NULL | — | —; `packages/db/src/schema/governance.ts:79` |
| `occurred_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/governance.ts:80` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE INDEX "analytics_events_name_idx" ON "analytics_events" USING btree ("name","occurred_at");
CREATE INDEX "analytics_events_customer_idx" ON "analytics_events" USING btree ("customer_id");
```

### announcements

Definition: `packages/db/src/schema/site.ts:13`. Introduced by `packages/db/migrations/0013_site_content.sql:36`.

Public current notice window; platform manage; named staff creator visible through row.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/site.ts:14` |
| `message` | `text` | NOT NULL | — | —; `packages/db/src/schema/site.ts:15` |
| `message_en` | `text` | NULL | — | —; `packages/db/src/schema/site.ts:17` |
| `href` | `text` | NULL | — | —; `packages/db/src/schema/site.ts:20` |
| `starts_at` | `timestamptz` | NOT NULL | — | —; `packages/db/src/schema/site.ts:21` |
| `ends_at` | `timestamptz` | NOT NULL | — | —; `packages/db/src/schema/site.ts:22` |
| `created_by` | `uuid` | NOT NULL | — | `platform_staff.id`; `packages/db/src/schema/site.ts:23` |
| `created_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/site.ts:24` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE INDEX announcements_window_idx ON announcements (starts_at DESC, ends_at);
```

### attribution_touches

Definition: `packages/db/src/schema/orders.ts:75`. Introduced by `packages/db/migrations/0000_initial.sql:184`.

Evidence shell; checkout insert only, platform management; no ordinary placement writes. No seller trail read.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/orders.ts:76` |
| `order_id` | `uuid` | NULL | — | `orders.id`; `packages/db/src/schema/orders.ts:77` |
| `customer_id` | `uuid` | NULL | — | `customers.id`; `packages/db/src/schema/orders.ts:78` |
| `anonymous_id` | `text` | NULL | — | —; `packages/db/src/schema/orders.ts:79` |
| `channel` | `touch_channel` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:80` |
| `ref` | `text` | NULL | — | —; `packages/db/src/schema/orders.ts:81` |
| `seller_id` | `uuid` | NULL | — | `sellers.id`; `packages/db/src/schema/orders.ts:82` |
| `occurred_at` | `timestamptz` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:83` |
| `created_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/orders.ts:84` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE INDEX "attribution_touches_order_idx" ON "attribution_touches" USING btree ("order_id");
CREATE INDEX "attribution_touches_customer_idx" ON "attribution_touches" USING btree ("customer_id");
CREATE INDEX "attribution_touches_anon_idx" ON "attribution_touches" USING btree ("anonymous_id");
```

### audit_log

Definition: `packages/db/src/schema/governance.ts:18`. Introduced by `packages/db/migrations/0000_initial.sql:426`.

Append-only platform actions; platform insert/read; request default from GUC. Audit is hand-called for many actions.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/governance.ts:19` |
| `action` | `audit_action` | NOT NULL | — | —; `packages/db/src/schema/governance.ts:20` |
| `actor_id` | `uuid` | NULL | — | —; `packages/db/src/schema/governance.ts:21` |
| `actor_label` | `text` | NOT NULL | — | —; `packages/db/src/schema/governance.ts:22` |
| `entity_table` | `text` | NOT NULL | — | —; `packages/db/src/schema/governance.ts:23` |
| `entity_id` | `uuid` | NULL | — | —; `packages/db/src/schema/governance.ts:24` |
| `before` | `text` | NULL | — | —; `packages/db/src/schema/governance.ts:25` |
| `after` | `text` | NULL | — | —; `packages/db/src/schema/governance.ts:26` |
| `note` | `text` | NULL | — | —; `packages/db/src/schema/governance.ts:27` |
| `occurred_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/governance.ts:28` |
| `request_id` | `uuid` | NULL | — | —; `packages/db/src/schema/governance.ts:34` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_table","entity_id");
CREATE INDEX "audit_log_occurred_idx" ON "audit_log" USING btree ("occurred_at");
CREATE INDEX audit_log_request_idx ON audit_log (request_id) WHERE request_id IS NOT NULL;
```

### brands

Definition: `packages/db/src/schema/catalogue.ts:23`. Introduced by `packages/db/migrations/0000_initial.sql:114`.

Seller-owned consumer brand identity; public when owning seller live; own seller manages; aftercare and platform.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/catalogue.ts:24` |
| `seller_id` | `uuid` | NOT NULL | — | `sellers.id`; `packages/db/src/schema/catalogue.ts:25` |
| `name` | `text` | NOT NULL | — | —; `packages/db/src/schema/catalogue.ts:26` |
| `name_en` | `text` | NULL | — | —; `packages/db/src/schema/catalogue.ts:27` |
| `slug` | `text` | NOT NULL | — | —; `packages/db/src/schema/catalogue.ts:28` |
| `story` | `text` | NULL | — | —; `packages/db/src/schema/catalogue.ts:29` |
| `created_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/catalogue.ts:30` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE UNIQUE INDEX "brands_slug_key" ON "brands" USING btree ("slug");
```

### commission_overrides

Definition: `packages/db/src/schema/money.ts:37`. Introduced by `packages/db/migrations/0000_initial.sql:331`.

Unused production override shell; seller-own read; platform manages. Per-rule/seller/source unique.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/money.ts:38` |
| `rule_set_id` | `uuid` | NOT NULL | — | `commission_rule_sets.id`; `packages/db/src/schema/money.ts:39` |
| `seller_id` | `uuid` | NOT NULL | — | `sellers.id`; `packages/db/src/schema/money.ts:40` |
| `source` | `order_source` | NOT NULL | — | —; `packages/db/src/schema/money.ts:41` |
| `bps` | `integer` | NOT NULL | — | —; `packages/db/src/schema/money.ts:42` |
| `note` | `text` | NULL | — | —; `packages/db/src/schema/money.ts:43` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE UNIQUE INDEX "commission_overrides_unique" ON "commission_overrides" USING btree ("rule_set_id","seller_id","source");
```

### commission_rule_sets

Definition: `packages/db/src/schema/money.ts:17`. Introduced by `packages/db/migrations/0000_initial.sql:340`.

Unused production configuration shell; platform manages; unconditional read policy (also anonymous under app_user). Two-approver CHECK incomplete.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/money.ts:18` |
| `version` | `integer` | NOT NULL | — | —; `packages/db/src/schema/money.ts:19` |
| `effective_from` | `timestamptz` | NOT NULL | — | —; `packages/db/src/schema/money.ts:20` |
| `approved_by` | `text[]` | NOT NULL | — | —; `packages/db/src/schema/money.ts:22` |
| `storefront_referral_bps` | `integer` | NOT NULL | — | —; `packages/db/src/schema/money.ts:23` |
| `direct_repeat_bps` | `integer` | NOT NULL | — | —; `packages/db/src/schema/money.ts:24` |
| `organic_search_bps` | `integer` | NOT NULL | — | —; `packages/db/src/schema/money.ts:25` |
| `paid_campaign_bps` | `integer` | NOT NULL | — | —; `packages/db/src/schema/money.ts:26` |
| `creator_affiliate_bps` | `integer` | NOT NULL | — | —; `packages/db/src/schema/money.ts:27` |
| `email_crm_bps` | `integer` | NOT NULL | — | —; `packages/db/src/schema/money.ts:28` |
| `unknown_bps` | `integer` | NOT NULL | — | —; `packages/db/src/schema/money.ts:29` |
| `storefront_window_days` | `integer` | NOT NULL | `30` | —; `packages/db/src/schema/money.ts:30` |
| `campaign_window_days` | `integer` | NOT NULL | `7` | —; `packages/db/src/schema/money.ts:31` |
| `creator_window_days` | `integer` | NOT NULL | `7` | —; `packages/db/src/schema/money.ts:32` |
| `email_window_days` | `integer` | NOT NULL | `7` | —; `packages/db/src/schema/money.ts:33` |
| `created_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/money.ts:34` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE UNIQUE INDEX "commission_rule_sets_version_key" ON "commission_rule_sets" USING btree ("version");
```

### consent_records

Definition: `packages/db/src/schema/governance.ts:41`. Introduced by `packages/db/migrations/0000_initial.sql:439`.

Schema-only consent facts; customer-own read/insert, platform; immutable UPDATE/DELETE trigger. No capture workflow.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/governance.ts:42` |
| `customer_id` | `uuid` | NOT NULL | — | `customers.id`; `packages/db/src/schema/governance.ts:43` |
| `purpose` | `consent_purpose` | NOT NULL | — | —; `packages/db/src/schema/governance.ts:44` |
| `granted` | `text` | NOT NULL | — | —; `packages/db/src/schema/governance.ts:45` |
| `source` | `text` | NOT NULL | — | —; `packages/db/src/schema/governance.ts:46` |
| `ip_hash` | `text` | NULL | — | —; `packages/db/src/schema/governance.ts:47` |
| `occurred_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/governance.ts:48` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE INDEX "consent_records_customer_idx" ON "consent_records" USING btree ("customer_id");
```

### content_images

Definition: `packages/db/src/schema/content.ts:71`. Introduced by `packages/db/migrations/0022_content_images.sql:20`.

Verified editorial image metadata; public when named in served Arabic blocks; platform management. English-only blocks not in RLS predicate.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `storage_key` | `text` | NOT NULL · PK | — | —; `packages/db/src/schema/content.ts:72` |
| `content_type` | `text` | NOT NULL | — | —; `packages/db/src/schema/content.ts:73` |
| `byte_size` | `integer` | NOT NULL | — | —; `packages/db/src/schema/content.ts:74` |
| `width` | `integer` | NOT NULL | — | —; `packages/db/src/schema/content.ts:75` |
| `height` | `integer` | NOT NULL | — | —; `packages/db/src/schema/content.ts:76` |
| `uploaded_by` | `uuid` | NOT NULL | — | `platform_staff.id`; `packages/db/src/schema/content.ts:77` |
| `uploaded_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/content.ts:78` |

No separately declared SQL secondary index found; primary-key backing index still applies.

### content_pages

Definition: `packages/db/src/schema/content.ts:19`. Introduced by `packages/db/migrations/0009_content.sql:42`.

CMS draft plus published pointer; platform management; public live row can include draft fields at raw SQL boundary.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/content.ts:20` |
| `slug` | `text` | NOT NULL | — | —; `packages/db/src/schema/content.ts:21` |
| `title` | `text` | NOT NULL | — | —; `packages/db/src/schema/content.ts:22` |
| `state` | `content_page_state` | NOT NULL | `'draft'` | —; `packages/db/src/schema/content.ts:23` |
| `draft_blocks` | `jsonb` | NOT NULL | `sql'[]'::jsonb` | —; `packages/db/src/schema/content.ts:32` |
| `title_en` | `text` | NULL | — | —; `packages/db/src/schema/content.ts:35` |
| `draft_blocks_en` | `jsonb` | NOT NULL | `sql'[]'::jsonb` | —; `packages/db/src/schema/content.ts:36` |
| `published_revision_id` | `uuid` | NULL | — | `content_revisions.id` (SQL-only); `packages/db/src/schema/content.ts:40` |
| `created_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/content.ts:42` |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/content.ts:43` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE UNIQUE INDEX content_pages_slug_key ON content_pages (slug);
```

### content_revisions

Definition: `packages/db/src/schema/content.ts:48`. Introduced by `packages/db/migrations/0009_content.sql:78`.

CMS published snapshots; public served revision, platform management; UPDATE forbidden, DELETE not forbidden by immutable trigger.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/content.ts:49` |
| `page_id` | `uuid` | NOT NULL | — | `content_pages.id`; `packages/db/src/schema/content.ts:50` |
| `title` | `text` | NOT NULL | — | —; `packages/db/src/schema/content.ts:54` |
| `blocks` | `jsonb` | NOT NULL | — | —; `packages/db/src/schema/content.ts:55` |
| `title_en` | `text` | NULL | — | —; `packages/db/src/schema/content.ts:57` |
| `blocks_en` | `jsonb` | NOT NULL | `sql'[]'::jsonb` | —; `packages/db/src/schema/content.ts:58` |
| `published_by` | `uuid` | NOT NULL | — | `platform_staff.id`; `packages/db/src/schema/content.ts:60` |
| `published_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/content.ts:61` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE INDEX content_revisions_page_idx ON content_revisions (page_id, published_at DESC);
```

### customer_addresses

Definition: `packages/db/src/schema/identity.ts:31`. Introduced by `packages/db/migrations/0000_initial.sql:36`.

Saved-address shell; checkout uses order snapshots, not this table. Customer-own and platform.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/identity.ts:32` |
| `customer_id` | `uuid` | NOT NULL | — | `customers.id`; `packages/db/src/schema/identity.ts:33` |
| `label` | `text` | NULL | — | —; `packages/db/src/schema/identity.ts:34` |
| `governorate` | `governorate` | NOT NULL | — | —; `packages/db/src/schema/identity.ts:35` |
| `city` | `text` | NOT NULL | — | —; `packages/db/src/schema/identity.ts:36` |
| `area` | `text` | NOT NULL | — | —; `packages/db/src/schema/identity.ts:37` |
| `street` | `text` | NOT NULL | — | —; `packages/db/src/schema/identity.ts:38` |
| `building` | `text` | NOT NULL | — | —; `packages/db/src/schema/identity.ts:39` |
| `floor` | `text` | NULL | — | —; `packages/db/src/schema/identity.ts:40` |
| `apartment` | `text` | NULL | — | —; `packages/db/src/schema/identity.ts:41` |
| `landmark` | `text` | NULL | — | —; `packages/db/src/schema/identity.ts:43` |
| `contact_phone` | `text` | NOT NULL | — | —; `packages/db/src/schema/identity.ts:44` |
| `is_default` | `boolean` | NOT NULL | `false` | —; `packages/db/src/schema/identity.ts:45` |
| `created_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/identity.ts:46` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE INDEX "customer_addresses_customer_idx" ON "customer_addresses" USING btree ("customer_id");
```

### customers

Definition: `packages/db/src/schema/identity.ts:15`. Introduced by `packages/db/migrations/0000_initial.sql:53`.

Guest phone identity; orders, aftercare, identity lookup. checkout broad write/read; customer-self; platform.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/identity.ts:16` |
| `phone` | `text` | NOT NULL | — | —; `packages/db/src/schema/identity.ts:18` |
| `full_name` | `text` | NULL | — | —; `packages/db/src/schema/identity.ts:19` |
| `email` | `text` | NULL | — | —; `packages/db/src/schema/identity.ts:20` |
| `auth_user_id` | `uuid` | NULL | — | —; `packages/db/src/schema/identity.ts:22` |
| `claimed_at` | `timestamptz` | NULL | — | —; `packages/db/src/schema/identity.ts:23` |
| `created_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/identity.ts:24` |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/identity.ts:25` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE UNIQUE INDEX "customers_phone_key" ON "customers" USING btree ("phone");
CREATE INDEX "customers_auth_user_idx" ON "customers" USING btree ("auth_user_id");
```

### login_codes

Definition: `packages/db/src/schema/login-codes.ts:18`. Introduced by `packages/db/migrations/0025_login_codes.sql:60`.

Private OTP digests/expiry/attempts; no table row policies, guarded identity SECURITY DEFINER functions.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `phone` | `text` | NOT NULL · PK | — | —; `packages/db/src/schema/login-codes.ts:24` |
| `audience` | `text` | NOT NULL | — | —; `packages/db/src/schema/login-codes.ts:26` |
| `code_digest` | `text` | NOT NULL | — | —; `packages/db/src/schema/login-codes.ts:28` |
| `expires_at` | `timestamptz` | NOT NULL | — | —; `packages/db/src/schema/login-codes.ts:29` |
| `attempts` | `integer` | NOT NULL | `0` | —; `packages/db/src/schema/login-codes.ts:31` |
| `created_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/login-codes.ts:32` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE INDEX login_codes_expires_idx ON login_codes (expires_at);
```

### note_glossary

Definition: `packages/db/src/schema/site.ts:46`. Introduced by `packages/db/migrations/0030_english_content.sql:53`.

Public Arabic-to-English note labels/icon dictionary; platform manage. Product note arrays have no FK to it.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `ar` | `text` | NOT NULL · PK | — | —; `packages/db/src/schema/site.ts:47` |
| `en` | `text` | NOT NULL | — | —; `packages/db/src/schema/site.ts:48` |
| `icon` | `note_icon` | NULL | — | —; `packages/db/src/schema/site.ts:50` |
| `updated_by` | `uuid` | NULL | — | `platform_staff.id`; `packages/db/src/schema/site.ts:51` |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/site.ts:52` |

No separately declared SQL secondary index found; primary-key backing index still applies.

### order_line_items

Definition: `packages/db/src/schema/orders.ts:167`. Introduced by `packages/db/migrations/0000_initial.sql:196`.

Checkout product/price/commission snapshots; seller-own and customer-linked read; checkout insert/read, aftercare, platform.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/orders.ts:168` |
| `sub_order_id` | `uuid` | NOT NULL | — | `sub_orders.id`; `packages/db/src/schema/orders.ts:169` |
| `product_id` | `uuid` | NOT NULL | — | `products.id`; `packages/db/src/schema/orders.ts:170` |
| `product_name` | `text` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:173` |
| `brand_name` | `text` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:174` |
| `sku` | `text` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:175` |
| `volume_ml` | `integer` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:176` |
| `quantity` | `integer` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:178` |
| `unit_price_piastres` | `integer` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:179` |
| `line_piastres` | `integer` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:180` |
| `commission_source` | `order_source` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:183` |
| `commission_bps` | `integer` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:184` |
| `commission_rule_set_version` | `integer` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:185` |
| `commission_piastres` | `integer` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:186` |
| `created_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/orders.ts:188` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE INDEX "order_line_items_sub_idx" ON "order_line_items" USING btree ("sub_order_id");
```

### orders

Definition: `packages/db/src/schema/orders.ts:27`. Introduced by `packages/db/migrations/0000_initial.sql:214`.

Marketplace parent/contact/address/payment shell; never seller-readable. Checkout broad graph access, aftercare, customer-own, platform.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/orders.ts:28` |
| `reference` | `text` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:29` |
| `customer_id` | `uuid` | NOT NULL | — | `customers.id`; `packages/db/src/schema/orders.ts:31` |
| `contact_phone` | `text` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:33` |
| `contact_name` | `text` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:34` |
| `governorate` | `governorate` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:37` |
| `city` | `text` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:38` |
| `area` | `text` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:39` |
| `street` | `text` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:40` |
| `building` | `text` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:41` |
| `floor` | `text` | NULL | — | —; `packages/db/src/schema/orders.ts:42` |
| `apartment` | `text` | NULL | — | —; `packages/db/src/schema/orders.ts:43` |
| `landmark` | `text` | NULL | — | —; `packages/db/src/schema/orders.ts:44` |
| `source` | `order_source` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:47` |
| `source_ref` | `text` | NULL | — | —; `packages/db/src/schema/orders.ts:48` |
| `attribution_reason` | `text` | NULL | — | —; `packages/db/src/schema/orders.ts:49` |
| `attribution_windows_json` | `text` | NULL | — | —; `packages/db/src/schema/orders.ts:50` |
| `campaign_id` | `text` | NULL | — | —; `packages/db/src/schema/orders.ts:51` |
| `creator_code` | `text` | NULL | — | —; `packages/db/src/schema/orders.ts:52` |
| `referring_seller_id` | `uuid` | NULL | — | `sellers.id`; `packages/db/src/schema/orders.ts:53` |
| `merchandise_piastres` | `integer` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:56` |
| `shipping_piastres` | `integer` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:57` |
| `discount_piastres` | `integer` | NOT NULL | `0` | —; `packages/db/src/schema/orders.ts:58` |
| `total_piastres` | `integer` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:59` |
| `payment_method` | `payment_method` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:61` |
| `payment_state` | `payment_state` | NOT NULL | `'pending'` | —; `packages/db/src/schema/orders.ts:62` |
| `payment_ref` | `text` | NULL | — | —; `packages/db/src/schema/orders.ts:63` |
| `placed_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/orders.ts:65` |
| `created_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/orders.ts:66` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE UNIQUE INDEX "orders_reference_key" ON "orders" USING btree ("reference");
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id");
CREATE INDEX "orders_source_idx" ON "orders" USING btree ("source");
CREATE INDEX "orders_placed_idx" ON "orders" USING btree ("placed_at");
```

### payout_lines

Definition: `packages/db/src/schema/money.ts:73`. Introduced by `packages/db/migrations/0000_initial.sql:359`.

Statement items; owner through payout read; platform manages. Unique within a payout only; DB returned-state reversal incompatible.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/money.ts:74` |
| `payout_id` | `uuid` | NOT NULL | — | `payouts.id`; `packages/db/src/schema/money.ts:75` |
| `sub_order_id` | `uuid` | NOT NULL | — | `sub_orders.id`; `packages/db/src/schema/money.ts:76` |
| `gross_piastres` | `integer` | NOT NULL | — | —; `packages/db/src/schema/money.ts:77` |
| `commission_piastres` | `integer` | NOT NULL | — | —; `packages/db/src/schema/money.ts:78` |
| `commission_source` | `order_source` | NOT NULL | — | —; `packages/db/src/schema/money.ts:79` |
| `commission_bps` | `integer` | NOT NULL | — | —; `packages/db/src/schema/money.ts:80` |
| `shipping_piastres` | `integer` | NOT NULL | — | —; `packages/db/src/schema/money.ts:81` |
| `net_piastres` | `integer` | NOT NULL | — | —; `packages/db/src/schema/money.ts:82` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE UNIQUE INDEX "payout_lines_unique" ON "payout_lines" USING btree ("payout_id","sub_order_id");
CREATE INDEX "payout_lines_payout_idx" ON "payout_lines" USING btree ("payout_id");
```

### payouts

Definition: `packages/db/src/schema/money.ts:46`. Introduced by `packages/db/migrations/0000_initial.sql:371`.

Saved statement header (not proven transferred cash); owner-only seller read; platform manages. No exactly-once settlement claim.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/money.ts:47` |
| `seller_id` | `uuid` | NOT NULL | — | `sellers.id`; `packages/db/src/schema/money.ts:48` |
| `reference` | `text` | NOT NULL | — | —; `packages/db/src/schema/money.ts:49` |
| `status` | `payout_status` | NOT NULL | `'accruing'` | —; `packages/db/src/schema/money.ts:50` |
| `period_start` | `timestamptz` | NOT NULL | — | —; `packages/db/src/schema/money.ts:51` |
| `period_end` | `timestamptz` | NOT NULL | — | —; `packages/db/src/schema/money.ts:52` |
| `gross_piastres` | `integer` | NOT NULL | `0` | —; `packages/db/src/schema/money.ts:54` |
| `commission_piastres` | `integer` | NOT NULL | `0` | —; `packages/db/src/schema/money.ts:55` |
| `shipping_piastres` | `integer` | NOT NULL | `0` | —; `packages/db/src/schema/money.ts:56` |
| `refunds_piastres` | `integer` | NOT NULL | `0` | —; `packages/db/src/schema/money.ts:57` |
| `adjustments_piastres` | `integer` | NOT NULL | `0` | —; `packages/db/src/schema/money.ts:58` |
| `net_piastres` | `integer` | NOT NULL | `0` | —; `packages/db/src/schema/money.ts:59` |
| `scheduled_for` | `timestamptz` | NULL | — | —; `packages/db/src/schema/money.ts:62` |
| `dispute_deadline` | `timestamptz` | NULL | — | —; `packages/db/src/schema/money.ts:63` |
| `paid_at` | `timestamptz` | NULL | — | —; `packages/db/src/schema/money.ts:64` |
| `approved_by` | `uuid` | NULL | — | —; `packages/db/src/schema/money.ts:65` |
| `created_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/money.ts:66` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE UNIQUE INDEX "payouts_reference_key" ON "payouts" USING btree ("reference");
CREATE INDEX "payouts_seller_status_idx" ON "payouts" USING btree ("seller_id","status");
```

### platform_staff

Definition: `packages/db/src/schema/governance.ts:149`. Introduced by `packages/db/migrations/0007_platform_staff.sql:22`.

Ops/admin membership; platform manage; identity read; SQL helper. Operator vs finance separation incomplete.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/governance.ts:150` |
| `auth_user_id` | `uuid` | NOT NULL | — | —; `packages/db/src/schema/governance.ts:151` |
| `full_name` | `text` | NOT NULL | — | —; `packages/db/src/schema/governance.ts:152` |
| `phone` | `text` | NOT NULL | — | —; `packages/db/src/schema/governance.ts:153` |
| `role` | `text` | NOT NULL | `'operator'` | —; `packages/db/src/schema/governance.ts:154` |
| `revoked_at` | `timestamptz` | NULL | — | —; `packages/db/src/schema/governance.ts:155` |
| `created_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/governance.ts:156` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE UNIQUE INDEX platform_staff_auth_user_key ON platform_staff (auth_user_id);
CREATE UNIQUE INDEX platform_staff_active_phone_key ON platform_staff (phone) WHERE revoked_at IS NULL;
```

### privacy_requests

Definition: `packages/db/src/schema/governance.ts:52`. Introduced by `packages/db/migrations/0000_initial.sql:449`.

Schema-only export/delete request queue; platform only. No customer submission/fulfilment workflow.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/governance.ts:53` |
| `customer_id` | `uuid` | NULL | — | `customers.id`; `packages/db/src/schema/governance.ts:54` |
| `contact_phone` | `text` | NOT NULL | — | —; `packages/db/src/schema/governance.ts:55` |
| `type` | `privacy_request_type` | NOT NULL | — | —; `packages/db/src/schema/governance.ts:56` |
| `status` | `privacy_request_status` | NOT NULL | `'received'` | —; `packages/db/src/schema/governance.ts:57` |
| `handled_by` | `uuid` | NULL | — | —; `packages/db/src/schema/governance.ts:58` |
| `due_at` | `timestamptz` | NULL | — | —; `packages/db/src/schema/governance.ts:59` |
| `completed_at` | `timestamptz` | NULL | — | —; `packages/db/src/schema/governance.ts:60` |
| `created_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/governance.ts:61` |

No separately declared SQL secondary index found; primary-key backing index still applies.

### product_media

Definition: `packages/db/src/schema/catalogue.ts:111`. Introduced by `packages/db/migrations/0000_initial.sql:124`.

Product photo metadata/rights; public for published product; owning seller manages; platform.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/catalogue.ts:112` |
| `product_id` | `uuid` | NOT NULL | — | `products.id`; `packages/db/src/schema/catalogue.ts:113` |
| `storage_path` | `text` | NOT NULL | — | —; `packages/db/src/schema/catalogue.ts:114` |
| `alt_text` | `text` | NOT NULL | — | —; `packages/db/src/schema/catalogue.ts:115` |
| `position` | `integer` | NOT NULL | `0` | —; `packages/db/src/schema/catalogue.ts:116` |
| `is_primary` | `boolean` | NOT NULL | `false` | —; `packages/db/src/schema/catalogue.ts:117` |
| `ownership_confirmed` | `boolean` | NOT NULL | `false` | —; `packages/db/src/schema/catalogue.ts:119` |
| `content_type` | `text` | NULL | — | —; `packages/db/src/schema/catalogue.ts:125` |
| `byte_size` | `integer` | NULL | — | —; `packages/db/src/schema/catalogue.ts:126` |
| `width` | `integer` | NULL | — | —; `packages/db/src/schema/catalogue.ts:127` |
| `height` | `integer` | NULL | — | —; `packages/db/src/schema/catalogue.ts:128` |
| `created_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/catalogue.ts:129` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE INDEX "product_media_product_idx" ON "product_media" USING btree ("product_id");
CREATE UNIQUE INDEX product_media_one_primary ON product_media (product_id) WHERE is_primary;
```

### product_revisions

Definition: `packages/db/src/schema/catalogue.ts:136`. Introduced by `packages/db/migrations/0000_initial.sql:135`.

Seller catalogue revision shell; immutable UPDATE/DELETE trigger; own read/insert, platform insert/read. No production revision INSERT found; listing update overwrites current product fields (F22).

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/catalogue.ts:137` |
| `product_id` | `uuid` | NOT NULL | — | `products.id`; `packages/db/src/schema/catalogue.ts:138` |
| `changed_by` | `uuid` | NULL | — | —; `packages/db/src/schema/catalogue.ts:139` |
| `changed_fields` | `text[]` | NOT NULL | — | —; `packages/db/src/schema/catalogue.ts:140` |
| `before` | `text` | NOT NULL | — | —; `packages/db/src/schema/catalogue.ts:141` |
| `after` | `text` | NOT NULL | — | —; `packages/db/src/schema/catalogue.ts:142` |
| `created_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/catalogue.ts:143` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE INDEX "product_revisions_product_idx" ON "product_revisions" USING btree ("product_id");
```

### products

Definition: `packages/db/src/schema/catalogue.ts:33`. Introduced by `packages/db/migrations/0000_initial.sql:145`.

Seller-scoped saleable listing, including size, concentration, price and mutable stock; public published rows, own seller manages, aftercare/platform. No stock ledger.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/catalogue.ts:34` |
| `seller_id` | `uuid` | NOT NULL | — | `sellers.id`; `packages/db/src/schema/catalogue.ts:37` |
| `brand_id` | `uuid` | NOT NULL | — | `brands.id`; `packages/db/src/schema/catalogue.ts:38` |
| `master_product_id` | `uuid` | NULL | — | —; `packages/db/src/schema/catalogue.ts:40` |
| `name` | `text` | NOT NULL | — | —; `packages/db/src/schema/catalogue.ts:41` |
| `name_en` | `text` | NULL | — | —; `packages/db/src/schema/catalogue.ts:42` |
| `slug` | `text` | NOT NULL | — | —; `packages/db/src/schema/catalogue.ts:43` |
| `sku` | `text` | NOT NULL | — | —; `packages/db/src/schema/catalogue.ts:44` |
| `status` | `product_status` | NOT NULL | `'draft'` | —; `packages/db/src/schema/catalogue.ts:45` |
| `price_piastres` | `integer` | NOT NULL | — | —; `packages/db/src/schema/catalogue.ts:48` |
| `promo_price_piastres` | `integer` | NULL | — | —; `packages/db/src/schema/catalogue.ts:49` |
| `volume_ml` | `integer` | NOT NULL | — | —; `packages/db/src/schema/catalogue.ts:50` |
| `stock` | `integer` | NOT NULL | `0` | —; `packages/db/src/schema/catalogue.ts:51` |
| `fulfilment_hours` | `integer` | NOT NULL | `48` | —; `packages/db/src/schema/catalogue.ts:52` |
| `concentration` | `concentration` | NULL | — | —; `packages/db/src/schema/catalogue.ts:55` |
| `form` | `product_form` | NULL | — | —; `packages/db/src/schema/catalogue.ts:56` |
| `gender_positioning` | `gender_positioning` | NULL | — | —; `packages/db/src/schema/catalogue.ts:57` |
| `scent_family` | `scent_family` | NULL | — | —; `packages/db/src/schema/catalogue.ts:58` |
| `notes_top` | `text[]` | NULL | — | —; `packages/db/src/schema/catalogue.ts:59` |
| `notes_heart` | `text[]` | NULL | — | —; `packages/db/src/schema/catalogue.ts:60` |
| `notes_base` | `text[]` | NULL | — | —; `packages/db/src/schema/catalogue.ts:61` |
| `seasons` | `season[]` | NULL | — | —; `packages/db/src/schema/catalogue.ts:64` |
| `day_night` | `day_night` | NULL | — | —; `packages/db/src/schema/catalogue.ts:65` |
| `occasions` | `occasion[]` | NULL | — | —; `packages/db/src/schema/catalogue.ts:66` |
| `projection_band` | `projection_band` | NULL | — | —; `packages/db/src/schema/catalogue.ts:67` |
| `longevity_band` | `longevity_band` | NULL | — | —; `packages/db/src/schema/catalogue.ts:68` |
| `performance_source` | `performance_source` | NULL | — | —; `packages/db/src/schema/catalogue.ts:70` |
| `responsible_party_name` | `text` | NULL | — | —; `packages/db/src/schema/catalogue.ts:73` |
| `warnings_label_data` | `text` | NULL | — | —; `packages/db/src/schema/catalogue.ts:74` |
| `evidence_refs` | `text[]` | NULL | — | —; `packages/db/src/schema/catalogue.ts:75` |
| `return_eligibility` | `return_eligibility` | NULL | — | —; `packages/db/src/schema/catalogue.ts:78` |
| `defect_route` | `text` | NULL | — | —; `packages/db/src/schema/catalogue.ts:79` |
| `moderation_notes` | `text` | NULL | — | —; `packages/db/src/schema/catalogue.ts:82` |
| `moderation_reason` | `moderation_reason` | NULL | — | —; `packages/db/src/schema/catalogue.ts:92` |
| `submitted_at` | `timestamptz` | NULL | — | —; `packages/db/src/schema/catalogue.ts:93` |
| `moderated_at` | `timestamptz` | NULL | — | —; `packages/db/src/schema/catalogue.ts:94` |
| `moderated_by` | `uuid` | NULL | — | `platform_staff.id` (SQL-only); `packages/db/src/schema/catalogue.ts:95` |
| `published_at` | `timestamptz` | NULL | — | —; `packages/db/src/schema/catalogue.ts:97` |
| `search_text` | `text` | NOT NULL | `''` | —; `packages/db/src/schema/catalogue.ts:100` |
| `created_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/catalogue.ts:101` |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/catalogue.ts:102` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE UNIQUE INDEX "products_slug_key" ON "products" USING btree ("slug");
CREATE UNIQUE INDEX "products_seller_sku_key" ON "products" USING btree ("seller_id","sku");
CREATE INDEX "products_status_idx" ON "products" USING btree ("status");
CREATE INDEX "products_family_idx" ON "products" USING btree ("scent_family");
CREATE INDEX "products_brand_idx" ON "products" USING btree ("brand_id");
CREATE INDEX products_awaiting_moderation_idx ON products (submitted_at) WHERE status = 'pending_moderation';
CREATE INDEX products_search_trgm ON products USING gin (search_text gin_trgm_ops);
```

### returns

Definition: `packages/db/src/schema/fulfilment.ts:43`. Introduced by `packages/db/migrations/0000_initial.sql:276`.

Customer aftercare case; seller-own read/update with money-column guard; customer-own ALL; aftercare insert/read; platform. Not a refund transaction.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/fulfilment.ts:44` |
| `sub_order_id` | `uuid` | NOT NULL | — | `sub_orders.id`; `packages/db/src/schema/fulfilment.ts:45` |
| `line_item_id` | `uuid` | NULL | — | `order_line_items.id`; `packages/db/src/schema/fulfilment.ts:46` |
| `status` | `return_status` | NOT NULL | `'requested'` | —; `packages/db/src/schema/fulfilment.ts:47` |
| `reason` | `reason_code` | NOT NULL | — | —; `packages/db/src/schema/fulfilment.ts:48` |
| `customer_note` | `text` | NULL | — | —; `packages/db/src/schema/fulfilment.ts:49` |
| `evidence_refs` | `text[]` | NULL | — | —; `packages/db/src/schema/fulfilment.ts:50` |
| `cost_bearer` | `cost_bearer` | NOT NULL | `'unallocated'` | —; `packages/db/src/schema/fulfilment.ts:52` |
| `refund_piastres` | `integer` | NULL | — | —; `packages/db/src/schema/fulfilment.ts:53` |
| `decided_by` | `uuid` | NULL | — | —; `packages/db/src/schema/fulfilment.ts:54` |
| `decided_at` | `timestamptz` | NULL | — | —; `packages/db/src/schema/fulfilment.ts:55` |
| `requested_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/fulfilment.ts:56` |
| `closed_at` | `timestamptz` | NULL | — | —; `packages/db/src/schema/fulfilment.ts:57` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE INDEX "returns_sub_order_idx" ON "returns" USING btree ("sub_order_id");
```

### reviews

Definition: `packages/db/src/schema/trust.ts:16`. Introduced by `packages/db/migrations/0000_initial.sql:391`.

Delivered-line review + public masked byline; public nonhidden ALL columns; customer insert/update; aftercare insert/read; platform moderation. No seller mutation policy.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/trust.ts:17` |
| `sub_order_id` | `uuid` | NOT NULL | — | `sub_orders.id`; `packages/db/src/schema/trust.ts:18` |
| `line_item_id` | `uuid` | NOT NULL | — | `order_line_items.id`; `packages/db/src/schema/trust.ts:19` |
| `product_id` | `uuid` | NOT NULL | — | `products.id`; `packages/db/src/schema/trust.ts:20` |
| `customer_id` | `uuid` | NOT NULL | — | `customers.id`; `packages/db/src/schema/trust.ts:21` |
| `rating_scent` | `integer` | NOT NULL | — | —; `packages/db/src/schema/trust.ts:24` |
| `rating_longevity` | `integer` | NOT NULL | — | —; `packages/db/src/schema/trust.ts:25` |
| `rating_projection` | `integer` | NOT NULL | — | —; `packages/db/src/schema/trust.ts:26` |
| `rating_value` | `integer` | NOT NULL | — | —; `packages/db/src/schema/trust.ts:27` |
| `rating_packaging` | `integer` | NOT NULL | — | —; `packages/db/src/schema/trust.ts:28` |
| `rating_description_accuracy` | `integer` | NOT NULL | — | —; `packages/db/src/schema/trust.ts:30` |
| `body` | `text` | NULL | — | —; `packages/db/src/schema/trust.ts:32` |
| `author_label` | `text` | NOT NULL | — | —; `packages/db/src/schema/trust.ts:40` |
| `incentive_disclosed` | `boolean` | NOT NULL | `false` | —; `packages/db/src/schema/trust.ts:42` |
| `moderated_by` | `uuid` | NULL | — | —; `packages/db/src/schema/trust.ts:44` |
| `moderated_at` | `timestamptz` | NULL | — | —; `packages/db/src/schema/trust.ts:45` |
| `moderation_note` | `text` | NULL | — | —; `packages/db/src/schema/trust.ts:46` |
| `hidden_at` | `timestamptz` | NULL | — | —; `packages/db/src/schema/trust.ts:47` |
| `created_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/trust.ts:49` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE UNIQUE INDEX "reviews_line_item_key" ON "reviews" USING btree ("line_item_id");
CREATE INDEX "reviews_product_idx" ON "reviews" USING btree ("product_id");
```

### seller_contacts

Definition: `packages/db/src/schema/sellers.ts:83`. Introduced by `packages/db/migrations/0026_seller_contacts.sql:41`.

Private phone/email; intake inserts; own/identity/platform read; platform write. 0026 removed former public columns.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `seller_id` | `uuid` | NOT NULL · PK | — | `sellers.id`; `packages/db/src/schema/sellers.ts:84` |
| `contact_phone` | `text` | NOT NULL | — | —; `packages/db/src/schema/sellers.ts:86` |
| `contact_email` | `text` | NULL | — | —; `packages/db/src/schema/sellers.ts:87` |
| `created_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/sellers.ts:88` |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/sellers.ts:89` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE INDEX seller_contacts_phone_idx ON seller_contacts (contact_phone);
```

### seller_staff

Definition: `packages/db/src/schema/sellers.ts:106`. Introduced by `packages/db/migrations/0000_initial.sql:64`.

Seller membership/roles/revocation; owner manages, own/identity read; platform. Role-limited operational mutation incomplete.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/sellers.ts:107` |
| `seller_id` | `uuid` | NOT NULL | — | `sellers.id`; `packages/db/src/schema/sellers.ts:108` |
| `auth_user_id` | `uuid` | NOT NULL | — | —; `packages/db/src/schema/sellers.ts:109` |
| `role` | `staff_role` | NOT NULL | `'viewer'` | —; `packages/db/src/schema/sellers.ts:110` |
| `full_name` | `text` | NOT NULL | — | —; `packages/db/src/schema/sellers.ts:111` |
| `phone` | `text` | NULL | — | —; `packages/db/src/schema/sellers.ts:112` |
| `revoked_at` | `timestamptz` | NULL | — | —; `packages/db/src/schema/sellers.ts:113` |
| `created_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/sellers.ts:114` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE UNIQUE INDEX "seller_staff_unique" ON "seller_staff" USING btree ("seller_id","auth_user_id");
CREATE INDEX "seller_staff_user_idx" ON "seller_staff" USING btree ("auth_user_id");
```

### seller_verifications

Definition: `packages/db/src/schema/sellers.ts:93`. Introduced by `packages/db/migrations/0000_initial.sql:75`.

Eight checklist controls and evidence refs; own read, intake insert, platform write. No private KYC object-store workflow proven.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/sellers.ts:94` |
| `seller_id` | `uuid` | NOT NULL | — | `sellers.id`; `packages/db/src/schema/sellers.ts:95` |
| `control` | `verification_control` | NOT NULL | — | —; `packages/db/src/schema/sellers.ts:96` |
| `status` | `verification_status` | NOT NULL | `'pending'` | —; `packages/db/src/schema/sellers.ts:97` |
| `evidence_ref` | `text` | NULL | — | —; `packages/db/src/schema/sellers.ts:98` |
| `notes` | `text` | NULL | — | —; `packages/db/src/schema/sellers.ts:99` |
| `reviewed_by` | `uuid` | NULL | — | —; `packages/db/src/schema/sellers.ts:100` |
| `reviewed_at` | `timestamptz` | NULL | — | —; `packages/db/src/schema/sellers.ts:101` |
| `created_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/sellers.ts:102` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE UNIQUE INDEX "seller_verifications_unique" ON "seller_verifications" USING btree ("seller_id","control");
```

### sellers

Definition: `packages/db/src/schema/sellers.ts:14`. Introduced by `packages/db/migrations/0000_initial.sql:87`.

Qualification, public storefront and SLA/commercial settings. Public live rows (ALL columns), own read/owner update; intake applied; aftercare; platform.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/sellers.ts:15` |
| `legal_name` | `text` | NULL | — | —; `packages/db/src/schema/sellers.ts:17` |
| `trading_name` | `text` | NOT NULL | — | —; `packages/db/src/schema/sellers.ts:18` |
| `owner_name` | `text` | NOT NULL | — | —; `packages/db/src/schema/sellers.ts:19` |
| `status` | `seller_status` | NOT NULL | `'applied'` | —; `packages/db/src/schema/sellers.ts:30` |
| `slug` | `text` | NOT NULL | — | —; `packages/db/src/schema/sellers.ts:33` |
| `bio` | `text` | NULL | — | —; `packages/db/src/schema/sellers.ts:34` |
| `story` | `text` | NULL | — | —; `packages/db/src/schema/sellers.ts:35` |
| `bio_en` | `text` | NULL | — | —; `packages/db/src/schema/sellers.ts:37` |
| `story_en` | `text` | NULL | — | —; `packages/db/src/schema/sellers.ts:38` |
| `founded_year` | `integer` | NULL | — | —; `packages/db/src/schema/sellers.ts:39` |
| `city` | `text` | NULL | — | —; `packages/db/src/schema/sellers.ts:40` |
| `service_governorates` | `governorate[]` | NULL | — | —; `packages/db/src/schema/sellers.ts:41` |
| `confirmation_sla_hours` | `integer` | NOT NULL | `24` | —; `packages/db/src/schema/sellers.ts:44` |
| `dispatch_sla_hours` | `integer` | NOT NULL | `48` | —; `packages/db/src/schema/sellers.ts:45` |
| `escalation_contact` | `text` | NULL | — | —; `packages/db/src/schema/sellers.ts:46` |
| `privacy_contact` | `text` | NULL | — | —; `packages/db/src/schema/sellers.ts:47` |
| `delivery_fulfilled_by` | `delivery_fulfilled_by` | NOT NULL | `'seller'` | —; `packages/db/src/schema/sellers.ts:51` |
| `payout_reserve_days` | `integer` | NOT NULL | `7` | —; `packages/db/src/schema/sellers.ts:52` |
| `dispute_window_days` | `integer` | NOT NULL | `7` | —; `packages/db/src/schema/sellers.ts:53` |
| `application_note` | `text` | NULL | — | —; `packages/db/src/schema/sellers.ts:56` |
| `applied_at` | `timestamptz` | NULL | — | —; `packages/db/src/schema/sellers.ts:57` |
| `approved_at` | `timestamptz` | NULL | — | —; `packages/db/src/schema/sellers.ts:59` |
| `live_at` | `timestamptz` | NULL | — | —; `packages/db/src/schema/sellers.ts:60` |
| `suspended_at` | `timestamptz` | NULL | — | —; `packages/db/src/schema/sellers.ts:61` |
| `created_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/sellers.ts:62` |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/sellers.ts:63` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE UNIQUE INDEX "sellers_slug_key" ON "sellers" USING btree ("slug");
CREATE INDEX "sellers_status_idx" ON "sellers" USING btree ("status");
```

### sessions

Definition: `packages/db/src/schema/sessions.ts:12`. Introduced by `packages/db/migrations/0028_sessions.sql:47`.

Revocable seller/platform sessions; identity read/insert/revoke; platform ALL. Revocation-only UPDATE trigger; platform DELETE possible.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/sessions.ts:13` |
| `audience` | `text` | NOT NULL | — | —; `packages/db/src/schema/sessions.ts:15` |
| `principal_id` | `uuid` | NOT NULL | — | —; `packages/db/src/schema/sessions.ts:17` |
| `seller_id` | `uuid` | NULL | — | `sellers.id`; `packages/db/src/schema/sessions.ts:18` |
| `issued_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/sessions.ts:19` |
| `expires_at` | `timestamptz` | NOT NULL | — | —; `packages/db/src/schema/sessions.ts:20` |
| `revoked_at` | `timestamptz` | NULL | — | —; `packages/db/src/schema/sessions.ts:21` |
| `ip_hash` | `text` | NULL | — | —; `packages/db/src/schema/sessions.ts:23` |
| `ua_hash` | `text` | NULL | — | —; `packages/db/src/schema/sessions.ts:24` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE INDEX sessions_open_by_principal_idx ON sessions (audience, principal_id) WHERE revoked_at IS NULL;
```

### shipment_events

Definition: `packages/db/src/schema/fulfilment.ts:33`. Introduced by `packages/db/migrations/0000_initial.sql:292`.

Future courier event facts; customer-linked read, platform. No seller event-write policy or production consumer.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/fulfilment.ts:34` |
| `shipment_id` | `uuid` | NOT NULL | — | `shipments.id`; `packages/db/src/schema/fulfilment.ts:35` |
| `code` | `text` | NOT NULL | — | —; `packages/db/src/schema/fulfilment.ts:36` |
| `description` | `text` | NULL | — | —; `packages/db/src/schema/fulfilment.ts:37` |
| `location` | `text` | NULL | — | —; `packages/db/src/schema/fulfilment.ts:38` |
| `occurred_at` | `timestamptz` | NOT NULL | — | —; `packages/db/src/schema/fulfilment.ts:39` |
| `received_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/fulfilment.ts:40` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE INDEX "shipment_events_shipment_idx" ON "shipment_events" USING btree ("shipment_id");
```

### shipments

Definition: `packages/db/src/schema/fulfilment.ts:13`. Introduced by `packages/db/migrations/0000_initial.sql:302`.

Manual courier/tracking and mutable COD fields; owning seller FOR ALL; customer-linked read, checkout read, platform. Seller can alter COD fields through SQL permissions.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/fulfilment.ts:14` |
| `sub_order_id` | `uuid` | NOT NULL | — | `sub_orders.id`; `packages/db/src/schema/fulfilment.ts:15` |
| `courier` | `text` | NOT NULL | `'bosta'` | —; `packages/db/src/schema/fulfilment.ts:17` |
| `tracking_number` | `text` | NULL | — | —; `packages/db/src/schema/fulfilment.ts:18` |
| `label_url` | `text` | NULL | — | —; `packages/db/src/schema/fulfilment.ts:19` |
| `delivery_attempts` | `integer` | NOT NULL | `0` | —; `packages/db/src/schema/fulfilment.ts:20` |
| `cod_amount_piastres` | `integer` | NULL | — | —; `packages/db/src/schema/fulfilment.ts:21` |
| `cod_collected_piastres` | `integer` | NULL | — | —; `packages/db/src/schema/fulfilment.ts:22` |
| `cod_remitted_at` | `timestamptz` | NULL | — | —; `packages/db/src/schema/fulfilment.ts:23` |
| `proof_of_delivery_ref` | `text` | NULL | — | —; `packages/db/src/schema/fulfilment.ts:24` |
| `dispatched_at` | `timestamptz` | NULL | — | —; `packages/db/src/schema/fulfilment.ts:25` |
| `delivered_at` | `timestamptz` | NULL | — | —; `packages/db/src/schema/fulfilment.ts:26` |
| `created_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/fulfilment.ts:27` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE INDEX "shipments_sub_order_idx" ON "shipments" USING btree ("sub_order_id");
CREATE INDEX "shipments_tracking_idx" ON "shipments" USING btree ("tracking_number");
```

### site_curation

Definition: `packages/db/src/schema/site.ts:29`. Introduced by `packages/db/migrations/0013_site_content.sql:69`.

Public singleton merchandising refs; platform manage. Featured UUID array has no per-element FK.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `singleton` | `boolean` | NOT NULL · PK | `true` | —; `packages/db/src/schema/site.ts:32` |
| `hero_product_id` | `uuid` | NULL | — | `products.id`; `packages/db/src/schema/site.ts:33` |
| `featured_product_ids` | `uuid[]` | NOT NULL | `sql'{}'::uuid[]` | —; `packages/db/src/schema/site.ts:35` |
| `updated_by` | `uuid` | NULL | — | `platform_staff.id`; `packages/db/src/schema/site.ts:37` |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/site.ts:38` |

No separately declared SQL secondary index found; primary-key backing index still applies.

### sub_order_transitions

Definition: `packages/db/src/schema/orders.ts:155`. Introduced by `packages/db/migrations/0000_initial.sql:246`.

Append-only operational transition facts; own seller read/insert; checkout, platform. Concurrent append is not deduplicated.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/orders.ts:156` |
| `sub_order_id` | `uuid` | NOT NULL | — | `sub_orders.id`; `packages/db/src/schema/orders.ts:157` |
| `from_state` | `sub_order_state` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:158` |
| `to_state` | `sub_order_state` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:159` |
| `actor` | `transition_actor` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:160` |
| `actor_id` | `uuid` | NULL | — | —; `packages/db/src/schema/orders.ts:161` |
| `reason` | `reason_code` | NULL | — | —; `packages/db/src/schema/orders.ts:162` |
| `note` | `text` | NULL | — | —; `packages/db/src/schema/orders.ts:163` |
| `occurred_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/orders.ts:164` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE INDEX "sub_order_transitions_sub_idx" ON "sub_order_transitions" USING btree ("sub_order_id");
```

### sub_orders

Definition: `packages/db/src/schema/orders.ts:92`. Introduced by `packages/db/migrations/0000_initial.sql:258`.

Tenant order/fulfilment slice + SLA/address snapshots; seller-own read/update, customer-linked read; checkout, aftercare, platform.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/orders.ts:93` |
| `order_id` | `uuid` | NOT NULL | — | `orders.id`; `packages/db/src/schema/orders.ts:94` |
| `seller_id` | `uuid` | NOT NULL | — | `sellers.id`; `packages/db/src/schema/orders.ts:95` |
| `reference` | `text` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:96` |
| `state` | `sub_order_state` | NOT NULL | `'placed'` | —; `packages/db/src/schema/orders.ts:98` |
| `merchandise_piastres` | `integer` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:100` |
| `shipping_piastres` | `integer` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:101` |
| `commission_piastres` | `integer` | NOT NULL | `0` | —; `packages/db/src/schema/orders.ts:102` |
| `delivery_fulfilled_by` | `delivery_fulfilled_by` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:118` |
| `dispatch_sla_hours` | `integer` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:126` |
| `recipient_name` | `text` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:128` |
| `recipient_phone` | `text` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:129` |
| `governorate` | `governorate` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:130` |
| `city` | `text` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:131` |
| `area` | `text` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:132` |
| `street` | `text` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:133` |
| `building` | `text` | NOT NULL | — | —; `packages/db/src/schema/orders.ts:134` |
| `floor` | `text` | NULL | — | —; `packages/db/src/schema/orders.ts:135` |
| `apartment` | `text` | NULL | — | —; `packages/db/src/schema/orders.ts:136` |
| `landmark` | `text` | NULL | — | —; `packages/db/src/schema/orders.ts:137` |
| `confirm_due_at` | `timestamptz` | NULL | — | —; `packages/db/src/schema/orders.ts:139` |
| `dispatch_due_at` | `timestamptz` | NULL | — | —; `packages/db/src/schema/orders.ts:140` |
| `confirmed_at` | `timestamptz` | NULL | — | —; `packages/db/src/schema/orders.ts:141` |
| `dispatched_at` | `timestamptz` | NULL | — | —; `packages/db/src/schema/orders.ts:142` |
| `delivered_at` | `timestamptz` | NULL | — | —; `packages/db/src/schema/orders.ts:143` |
| `closed_at` | `timestamptz` | NULL | — | —; `packages/db/src/schema/orders.ts:144` |
| `created_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/orders.ts:146` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE UNIQUE INDEX "sub_orders_reference_key" ON "sub_orders" USING btree ("reference");
CREATE INDEX "sub_orders_order_idx" ON "sub_orders" USING btree ("order_id");
CREATE INDEX "sub_orders_seller_state_idx" ON "sub_orders" USING btree ("seller_id","state");
CREATE INDEX "sub_orders_confirm_due_idx" ON "sub_orders" USING btree ("confirm_due_at");
```

### support_tickets

Definition: `packages/db/src/schema/governance.ts:108`. Introduced by `packages/db/migrations/0000_initial.sql:461`.

Guest support + optional order/seller links; aftercare insert/read; customer/seller-own read; platform write. Platform routes manage queue.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/governance.ts:109` |
| `reference` | `text` | NOT NULL | — | —; `packages/db/src/schema/governance.ts:110` |
| `customer_id` | `uuid` | NULL | — | `customers.id`; `packages/db/src/schema/governance.ts:111` |
| `order_id` | `uuid` | NULL | — | `orders.id`; `packages/db/src/schema/governance.ts:112` |
| `sub_order_id` | `uuid` | NULL | — | `sub_orders.id`; `packages/db/src/schema/governance.ts:113` |
| `seller_id` | `uuid` | NULL | — | `sellers.id`; `packages/db/src/schema/governance.ts:114` |
| `priority` | `ticket_priority` | NOT NULL | `'p3'` | —; `packages/db/src/schema/governance.ts:115` |
| `status` | `ticket_status` | NOT NULL | `'open'` | —; `packages/db/src/schema/governance.ts:116` |
| `category` | `text` | NOT NULL | — | —; `packages/db/src/schema/governance.ts:117` |
| `subject` | `text` | NOT NULL | — | —; `packages/db/src/schema/governance.ts:118` |
| `message` | `text` | NOT NULL | — | —; `packages/db/src/schema/governance.ts:120` |
| `contact_name` | `text` | NOT NULL | — | —; `packages/db/src/schema/governance.ts:128` |
| `contact_phone` | `text` | NOT NULL | — | —; `packages/db/src/schema/governance.ts:129` |
| `owner_id` | `uuid` | NULL | — | —; `packages/db/src/schema/governance.ts:130` |
| `next_action` | `text` | NULL | — | —; `packages/db/src/schema/governance.ts:131` |
| `resolution_code` | `text` | NULL | — | —; `packages/db/src/schema/governance.ts:132` |
| `first_response_at` | `timestamptz` | NULL | — | —; `packages/db/src/schema/governance.ts:133` |
| `resolved_at` | `timestamptz` | NULL | — | —; `packages/db/src/schema/governance.ts:134` |
| `created_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/governance.ts:135` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE UNIQUE INDEX "support_tickets_reference_key" ON "support_tickets" USING btree ("reference");
CREATE INDEX "support_tickets_status_idx" ON "support_tickets" USING btree ("status","priority");
CREATE INDEX support_tickets_phone_idx ON support_tickets (contact_phone);
```

### webhook_events

Definition: `packages/db/src/schema/governance.ts:91`. Introduced by `packages/db/migrations/0000_initial.sql:480`.

Provider-event dedupe shell; platform only. No authenticated ingress/processor/retry pipeline.

| Column | SQL type | Null / key | Default in Drizzle | FK target / source evidence |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL · PK | `gen_random_uuid()` | —; `packages/db/src/schema/governance.ts:92` |
| `provider` | `text` | NOT NULL | — | —; `packages/db/src/schema/governance.ts:93` |
| `provider_event_id` | `text` | NOT NULL | — | —; `packages/db/src/schema/governance.ts:94` |
| `event_type` | `text` | NOT NULL | — | —; `packages/db/src/schema/governance.ts:95` |
| `payload` | `text` | NOT NULL | — | —; `packages/db/src/schema/governance.ts:96` |
| `processed_at` | `timestamptz` | NULL | — | —; `packages/db/src/schema/governance.ts:97` |
| `attempts` | `integer` | NOT NULL | `0` | —; `packages/db/src/schema/governance.ts:98` |
| `last_error` | `text` | NULL | — | —; `packages/db/src/schema/governance.ts:99` |
| `received_at` | `timestamptz` | NOT NULL | `now()` | —; `packages/db/src/schema/governance.ts:100` |

Declared SQL indexes (primary keys additionally create their own backing indexes):

```sql
CREATE UNIQUE INDEX "webhook_events_provider_key" ON "webhook_events" USING btree ("provider","provider_event_id");
```

### schema_migrations — infrastructure, outside Drizzle

`filename text PRIMARY KEY`, `applied_at timestamptz NOT NULL DEFAULT now()`. Created by `packages/db/src/migrate.ts:84`; ENABLE RLS, not FORCED; revoke from PUBLIC/app_user at :100/:154 is best effort. No business FK. No checksums or migration runner lock; DDL and ledger insertion are separate calls. See F18.


## 8. Ordered migration ledger (source files, not deployed ledger contents)

| Migration | Bytes | SHA-256 |
|---|---:|---|
| `0000_initial.sql` | 35521 | `850954e4f44f135332c923dc263e24d344e60cf99d29a1b1937d18749094f252` |
| `0001_constraints.sql` | 13671 | `5df0088158f90218834178acb8283643fb6ba509452719d1ca332eb1514133ef` |
| `0002_rls.sql` | 14957 | `baa48ece3893f63d4817d3ba9232500e2006e1863e97b49538bd05cd37edfb15` |
| `0003_checkout.sql` | 4677 | `9635b3ef61b86ed93b7e5aa66cf9b3c54ebc405938c7384ce9f4373a7ef03401` |
| `0004_sub_order_delivery.sql` | 3314 | `c94100e68732571a7f93eababc6ebe6da63eb951ffb983520990c2460cb65d27` |
| `0005_checkout_handoff.sql` | 2001 | `402930fea529ba9ab7c25ab82dbfbb09ac2d28a733b1f8c79ac162f4ab3d2d5e` |
| `0006_tracking_visible.sql` | 1027 | `63f48a7d00399bd342fbc02eb3aef799d199a5392e8aff7e4bcc1744b91abee0` |
| `0007_platform_staff.sql` | 3085 | `96a94e3c3a403a5812307cf40f5c24bf31c42ec20a067cb2008b420d4ca4413f` |
| `0008_delivery_fulfilment.sql` | 3597 | `4665356b6bc87f73e4e54787a9e56ae1724d9a799af447c29576893876585504` |
| `0009_content.sql` | 8359 | `9a6cfe63ce65a81511de7eb613941bf1360f4a670abadcb927a8803bc4b217fb` |
| `0010_listing_moderation.sql` | 4942 | `0b1c2c0571cadcaa167a0571a50da52c652327f4696402f6c6b11ad935ed4ff2` |
| `0011_draft_price.sql` | 2592 | `56f27db0d2856c4713d6778388fc57819de0d7e65b9e83636dd6f0a3bc60ff01` |
| `0012_archive_unpriced.sql` | 1661 | `4007585d266b35330365ffaf765367cb492aef7ffb094b46ff3184079a38bc81` |
| `0013_site_content.sql` | 6709 | `b9d35e278493f9bcd92d56017e5fded4dd6481aa0f8b5147e5b2b2af4010f020` |
| `0014_search_text.sql` | 3159 | `1edf870db4b73accb8455f0b76e8dcd032532477d5ad3512e838b062e8df9f52` |
| `0015_aftercare.sql` | 9850 | `856a6b71fe28873f0042d31aef05a93f7d79ea843d6772fb10e7c0a963f0a52f` |
| `0016_review_byline.sql` | 3307 | `449c0a80cebf4fbaa28a95aaa58db3d4ff640345817eb0b2be4604317e7541c2` |
| `0017_support_message.sql` | 2720 | `4dfdea36975a57083beda8523dcd233263b9fcfd599358c4071a46870133e372` |
| `0018_intake.sql` | 5242 | `985c9f82b30218702a008495c9f86d4324e4ff6932f5a01f76c7920ed010043c` |
| `0019_seller_returns.sql` | 3013 | `ca6bff06e269f35ceea3028f352d030ec6fccd538a2ee3084375543ca5ce9637` |
| `0020_dispatch_clock.sql` | 4868 | `09437cc1901309cc19bc5e9bb1f3f243a750201c8ae517c47c5db8796378d7a6` |
| `0021_media_facts.sql` | 2596 | `ef5c07b2217a78d3258b0ce393c556b1beb9736bfcff9b8a95a1f45830c3ef5a` |
| `0022_content_images.sql` | 3985 | `6271b1eb934ae51f070bbee039017bc739ce718600efc45d1467f8a6fb3e4240` |
| `0023_analytics_intake.sql` | 5364 | `92d8ca3820d49bd269c6b9eca0397b59dd25842fc07e44bf15b435406470a25c` |
| `0024_publish_gate_verified_image.sql` | 4678 | `b182ee5cc8fab0cf419f9c9e5d0cf0a8f55f0510aa3e5b882a5b09a6b76d24e4` |
| `0025_login_codes.sql` | 11283 | `a882905eeae2b853f6ed8588be81b70688f5ca4c2bc50d03bd48d075e215b14a` |
| `0026_seller_contacts.sql` | 6160 | `7e95ebc4ae9a6494681de34146e71e3c557a44c9ea721f74b51389e9742e25ea` |
| `0027_identity_reads.sql` | 2735 | `da17a4db6e68c1c7f3c334ba8e13461ac488214ff95daf736158433d0d12e435` |
| `0028_sessions.sql` | 6664 | `70e70c819f581b1578282aa456422199823be171aa9191cac4a59aa24d9c6b44` |
| `0029_audit_request_id.sql` | 2207 | `05beceb31b62f76b4071774f8051085fc7016c7e417ec610ab6cb23a0ba184de` |
| `0030_english_content.sql` | 4613 | `b70b2ad4826f5dbf6e602bdf3a8ce3ca54f871ce1c4ff2f8c8b6fe68ec4cbbbe` |
| `0031_note_icons.sql` | 1166 | `6b10b3b40f5ddc370f18c5664fd842e54740e5a274e8377e12824206eb175e7a` |

## 9. Effective SQL-only invariants and drift

| Area | Effective SQL / mismatch |
|---|---|
| Money | 0001 integer line quantity/bps/line sum, order total checks; 0008 replaces payout net with gross − fee + reimbursed shipping. No cross-table sum constraint or balanced accounting transaction. |
| Draft/archive zero values | 0012 replaces 0011: zero price and volume allowed in draft **or archived**, never negative. Promo CHECK from 0001 remains. |
| Seller verification | 0001 seeds eight rows on insert; approval gate fires only on UPDATE and skips if OLD already approved/live. No seller actor/status guard analogous to listing moderation. |
| Publishing | 0024 replaces 0001 gate; requires a primary image with ownership/alt and non-null verified content type. 0010 blocks seller promotion to published/suspended. Warnings/evidence text completeness still weaker than founding schema. |
| Reviews/returns | 0015 replaces review trigger: delivered sub-order, matching line/product/customer. 0016 adds nonempty masked byline. Return line membership enforced; 0019 freezes seller money columns, not COD shipment columns. |
| Append-only | 0001 statement triggers protect audit_log, transitions, product_revisions and consent_records from UPDATE/DELETE. 0009 protects content_revisions UPDATE only. Payouts/lines and rule sets are mutable. |
| Dispatch | 0020 positive snapshot + fallback INSERT trigger; due must follow confirmation. Dispatch SLA snapshotted; reserve/dispute terms read live at payout/report time. |
| Media | 0021 all-or-none facts; unique primary photo. 0022 content media type/key/10MiB/dimension CHECKs; SQL public predicate inspects r.blocks, not English blocks. |
| OTP | 0025 no ordinary table policies; verification row locked and consumed. Functions accept caller-supplied max_attempts, checked by trusted app; harden at DB boundary. |
| Sessions | 0028 audience/seller relationship, expiry and revocation ordering CHECKs; SQL index is PARTIAL revoked_at IS NULL, Drizzle index is not. Trigger only controls UPDATE; platform ALL still allows DELETE. |
| Staff | 0007 SQL unique active-phone partial index; Drizzle describes a different nonunique phone index. Login seller lookup uses house contact, not individual staff phone. |
| SQL-only FKs | content_pages.published_revision_id (0009), products.moderated_by (0010). Drizzle fields do not declare either FK. Revision FK does not ensure revision belongs to that same page. |
| Audit | 0029 request_id default from GUC + partial request index; Drizzle omits both default and index. |
| Search | 0014 optional GIN pg_trgm index, broad exception fallback to scan; actual presence must be checked. Drizzle lacks GIN/partial moderation index. |
| Commission approval | array_length(approved_by,1) >= 2 can be NULL for empty arrays (CHECK passes NULL) and does not ensure distinct active approvers. Overrides have no bps-range CHECK. |
| Weak reference semantics | No product↔brand seller-consistency FK; no line↔sub-order seller-consistency FK; no payout-line seller consistency. creator/reviewer/actor UUIDs often have no FK intentionally; qualify each before changing. |
| Missing uniqueness | No (order_id,seller_id) unique; no global settlement claim; no return-line uniqueness or quantity allocation; no shipment idempotency identity. Do not impose one shipment per sub-order if future partial shipments are needed. |
| Tooling | Drizzle _journal.json lists only 0000 while custom runner lists all SQL files. npm package migrate script invokes drizzle-kit migrate. Standard generation/migration cannot be assumed to replay/preserve manual SQL. |

### SQL function/trigger/policy source locator

Latest function definitions replace earlier versions. The following declarations are an index, not statements executed by this audit. DO-loop platform/RLS policies in 0002 apply to their listed table sets.


`packages/db/migrations/0001_constraints.sql`

```text
76: CREATE OR REPLACE FUNCTION enforce_review_requires_delivery()
104: CREATE TRIGGER reviews_require_delivery
115: CREATE OR REPLACE FUNCTION enforce_publish_gate()
171: CREATE TRIGGER products_publish_gate
182: CREATE OR REPLACE FUNCTION enforce_seller_verification_complete()
209: CREATE TRIGGER sellers_verification_gate
222: CREATE OR REPLACE FUNCTION forbid_mutation()
229: CREATE TRIGGER audit_log_append_only
233: CREATE TRIGGER sub_order_transitions_append_only
237: CREATE TRIGGER product_revisions_append_only
241: CREATE TRIGGER consent_records_append_only
253: CREATE OR REPLACE FUNCTION enforce_sub_order_transition()
282: CREATE TRIGGER sub_orders_state_machine
290: CREATE OR REPLACE FUNCTION enforce_commission_on_completed_only()
306: CREATE TRIGGER payout_lines_completed_only
317: CREATE OR REPLACE FUNCTION seed_seller_verifications()
326: CREATE TRIGGER sellers_seed_verifications
```

`packages/db/migrations/0002_rls.sql`

```text
24: CREATE OR REPLACE FUNCTION app.actor_id() RETURNS uuid
30: CREATE OR REPLACE FUNCTION app.actor_role() RETURNS text
35: CREATE OR REPLACE FUNCTION app.is_platform() RETURNS boolean
39: CREATE OR REPLACE FUNCTION app.staff_seller_id() RETURNS uuid
46: CREATE OR REPLACE FUNCTION app.staff_role() RETURNS staff_role
54: CREATE OR REPLACE FUNCTION app.is_seller_owner() RETURNS boolean
58: CREATE OR REPLACE FUNCTION app.customer_id() RETURNS uuid
115: CREATE POLICY public_read_live_sellers ON sellers
118: CREATE POLICY public_read_published_products ON products
121: CREATE POLICY public_read_brands ON brands
125: CREATE POLICY public_read_media ON product_media
130: CREATE POLICY public_read_reviews ON reviews
137: CREATE POLICY seller_read_own ON sellers
139: CREATE POLICY seller_update_own ON sellers
143: CREATE POLICY seller_read_own_verifications ON seller_verifications
146: CREATE POLICY seller_read_own_staff ON seller_staff
149: CREATE POLICY seller_owner_manage_staff ON seller_staff
153: CREATE POLICY seller_manage_own_brands ON brands
157: CREATE POLICY seller_manage_own_products ON products
161: CREATE POLICY seller_manage_own_media ON product_media
167: CREATE POLICY seller_read_own_revisions ON product_revisions
170: CREATE POLICY seller_insert_own_revisions ON product_revisions
176: CREATE POLICY seller_read_own_sub_orders ON sub_orders
178: CREATE POLICY seller_update_own_sub_orders ON sub_orders
182: CREATE POLICY seller_read_own_transitions ON sub_order_transitions
186: CREATE POLICY seller_insert_own_transitions ON sub_order_transitions
191: CREATE POLICY seller_read_own_line_items ON order_line_items
196: CREATE POLICY seller_manage_own_shipments ON shipments
202: CREATE POLICY seller_read_own_returns ON returns
207: CREATE POLICY seller_owner_read_payouts ON payouts
209: CREATE POLICY seller_owner_read_payout_lines ON payout_lines
213: CREATE POLICY seller_owner_read_adjustments ON adjustments
217: CREATE POLICY seller_read_rule_sets ON commission_rule_sets FOR SELECT USING (true);
218: CREATE POLICY seller_read_own_overrides ON commission_overrides
221: CREATE POLICY seller_read_own_tickets ON support_tickets
228: CREATE POLICY customer_read_self ON customers
230: CREATE POLICY customer_update_self ON customers
233: CREATE POLICY customer_manage_own_addresses ON customer_addresses
237: CREATE POLICY customer_read_own_orders ON orders
240: CREATE POLICY customer_read_own_sub_orders ON sub_orders
244: CREATE POLICY customer_read_own_line_items ON order_line_items
249: CREATE POLICY customer_read_own_shipments ON shipments
254: CREATE POLICY customer_read_own_shipment_events ON shipment_events
260: CREATE POLICY customer_manage_own_returns ON returns
269: CREATE POLICY customer_write_own_reviews ON reviews
271: CREATE POLICY customer_edit_own_reviews ON reviews
275: CREATE POLICY customer_read_own_consents ON consent_records
277: CREATE POLICY customer_write_own_consents ON consent_records
280: CREATE POLICY customer_read_own_tickets ON support_tickets
317: GRANT USAGE ON SCHEMA public TO app_user;
318: GRANT USAGE ON SCHEMA app    TO app_user;
319: GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
320: GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO app_user;
321: ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
```

`packages/db/migrations/0003_checkout.sql`

```text
30: CREATE OR REPLACE FUNCTION app.is_checkout() RETURNS boolean
42: CREATE POLICY checkout_insert_customers ON customers
45: CREATE POLICY checkout_select_customers ON customers
48: CREATE POLICY checkout_update_customers ON customers
59: CREATE POLICY checkout_insert_orders ON orders
62: CREATE POLICY checkout_select_orders ON orders
65: CREATE POLICY checkout_insert_sub_orders ON sub_orders
68: CREATE POLICY checkout_select_sub_orders ON sub_orders
71: CREATE POLICY checkout_insert_line_items ON order_line_items
74: CREATE POLICY checkout_select_line_items ON order_line_items
85: CREATE POLICY checkout_insert_touches ON attribution_touches
```

`packages/db/migrations/0005_checkout_handoff.sql`

```text
25: CREATE POLICY checkout_handoff_sub_orders ON sub_orders
31: CREATE POLICY checkout_record_transition ON sub_order_transitions
34: CREATE POLICY checkout_read_transition ON sub_order_transitions
```

`packages/db/migrations/0006_tracking_visible.sql`

```text
19: CREATE POLICY checkout_read_shipments ON shipments
```

`packages/db/migrations/0007_platform_staff.sql`

```text
51: CREATE POLICY platform_manage_staff ON platform_staff
54: GRANT SELECT, INSERT, UPDATE, DELETE ON platform_staff TO app_user;
63: CREATE OR REPLACE FUNCTION app.platform_staff_id() RETURNS uuid
```

`packages/db/migrations/0009_content.sql`

```text
115: CREATE OR REPLACE FUNCTION app.refuse_revision_rewrite() RETURNS trigger
123: CREATE TRIGGER content_revisions_immutable
146: CREATE POLICY public_read_live_pages ON content_pages
153: CREATE POLICY public_read_served_revisions ON content_revisions
160: CREATE POLICY platform_manage_pages ON content_pages
163: CREATE POLICY platform_manage_revisions ON content_revisions
166: GRANT SELECT, INSERT, UPDATE, DELETE ON content_pages TO app_user;--> statement-breakpoint
167: GRANT SELECT, INSERT, UPDATE, DELETE ON content_revisions TO app_user;
```

`packages/db/migrations/0010_listing_moderation.sql`

```text
69: CREATE OR REPLACE FUNCTION app.guard_listing_status() RETURNS trigger
100: CREATE TRIGGER products_status_guard
```

`packages/db/migrations/0013_site_content.sql`

```text
116: CREATE POLICY public_read_current_announcement ON announcements
119: CREATE POLICY platform_manage_announcements ON announcements
125: CREATE POLICY public_read_curation ON site_curation
128: CREATE POLICY platform_manage_curation ON site_curation
131: GRANT SELECT, INSERT, UPDATE, DELETE ON announcements TO app_user;--> statement-breakpoint
132: GRANT SELECT, INSERT, UPDATE, DELETE ON site_curation TO app_user;
```

`packages/db/migrations/0015_aftercare.sql`

```text
43: CREATE OR REPLACE FUNCTION app.is_aftercare() RETURNS boolean
60: CREATE POLICY aftercare_select_orders ON orders
63: CREATE POLICY aftercare_select_sub_orders ON sub_orders
66: CREATE POLICY aftercare_select_line_items ON order_line_items
69: CREATE POLICY aftercare_select_customers ON customers
72: CREATE POLICY aftercare_select_products ON products
75: CREATE POLICY aftercare_select_brands ON brands
78: CREATE POLICY aftercare_select_sellers ON sellers
94: CREATE POLICY aftercare_insert_reviews ON reviews
97: CREATE POLICY aftercare_select_reviews ON reviews
109: CREATE POLICY aftercare_insert_returns ON returns
112: CREATE POLICY aftercare_select_returns ON returns
122: CREATE POLICY aftercare_insert_tickets ON support_tickets
125: CREATE POLICY aftercare_select_tickets ON support_tickets
145: CREATE OR REPLACE FUNCTION enforce_review_requires_delivery()
203: CREATE OR REPLACE FUNCTION enforce_return_line_belongs()
216: CREATE TRIGGER returns_line_belongs
```

`packages/db/migrations/0018_intake.sql`

```text
25: CREATE OR REPLACE FUNCTION app.is_intake() RETURNS boolean
53: CREATE POLICY intake_insert_sellers ON sellers
56: CREATE POLICY intake_select_sellers ON sellers
76: CREATE POLICY intake_insert_verifications ON seller_verifications
```

`packages/db/migrations/0019_seller_returns.sql`

```text
27: CREATE POLICY seller_update_own_returns ON returns
44: CREATE OR REPLACE FUNCTION enforce_return_money_is_platform_only()
60: CREATE TRIGGER returns_money_is_platform_only
```

`packages/db/migrations/0020_dispatch_clock.sql`

```text
55: CREATE OR REPLACE FUNCTION snapshot_dispatch_sla()
65: CREATE TRIGGER sub_orders_snapshot_dispatch_sla
```

`packages/db/migrations/0022_content_images.sql`

```text
65: CREATE POLICY public_read_served_content_images ON content_images
75: CREATE POLICY platform_manage_content_images ON content_images
80: GRANT SELECT, INSERT, UPDATE, DELETE ON content_images TO app_user;
```

`packages/db/migrations/0023_analytics_intake.sql`

```text
47: CREATE OR REPLACE FUNCTION app.is_analytics() RETURNS boolean
50: CREATE POLICY analytics_insert_events ON analytics_events
81: CREATE OR REPLACE FUNCTION app.purge_analytics_events(older_than_days integer)
```

`packages/db/migrations/0024_publish_gate_verified_image.sql`

```text
28: CREATE OR REPLACE FUNCTION enforce_publish_gate()
```

`packages/db/migrations/0025_login_codes.sql`

```text
57: CREATE OR REPLACE FUNCTION app.is_identity() RETURNS boolean
117: CREATE OR REPLACE FUNCTION app.issue_login_code(
165: CREATE OR REPLACE FUNCTION app.verify_login_code(
230: CREATE OR REPLACE FUNCTION app.purge_expired_login_codes() RETURNS bigint
```

`packages/db/migrations/0026_seller_contacts.sql`

```text
94: CREATE POLICY platform_all ON seller_contacts
98: CREATE POLICY seller_read_own_contact ON seller_contacts
105: CREATE POLICY intake_insert_contact ON seller_contacts
```

`packages/db/migrations/0027_identity_reads.sql`

```text
40: CREATE POLICY identity_read_seller_contacts ON seller_contacts
45: CREATE POLICY identity_read_seller_staff ON seller_staff
49: CREATE POLICY identity_read_platform_staff ON platform_staff
```

`packages/db/migrations/0028_sessions.sql`

```text
93: CREATE OR REPLACE FUNCTION app.sessions_only_revoke() RETURNS trigger
114: CREATE TRIGGER sessions_only_revoke
125: CREATE POLICY platform_all ON sessions
131: CREATE POLICY identity_read_sessions ON sessions
134: CREATE POLICY identity_open_sessions ON sessions
137: CREATE POLICY identity_revoke_sessions ON sessions
```

`packages/db/migrations/0030_english_content.sql`

```text
71: CREATE POLICY public_read_note_glossary ON note_glossary
76: CREATE POLICY platform_manage_note_glossary ON note_glossary
79: GRANT SELECT, INSERT, UPDATE, DELETE ON note_glossary TO app_user;
```

## 10. Source fingerprint

SHA-256 over sorted relative paths and per-file SHA-256 values for 424 audit-relevant source/configuration/document files: `e326dc80a09a785d3a9d1ca7303e9518644281c04915596ff814fe4a63e5aa65`. This identifies this folder snapshot; it is not a git commit, a live database fingerprint, or a guarantee that external deployment matches.

Fresh validation: schema extraction found 39 application tables, all with matching CREATE TABLE introductions across 32 consecutively numbered SQL files. The ERD includes the infrastructure ledger and SQL-only FKs. Tests were read, not executed. Runtime catalog validation remains a required later gate.


## 11. Latest named SQL CHECK definitions

Latest definition per constraint name, derived statically from ordered SQL. No catalog query was run. These complement unique/primary indexes and trigger invariants listed above; absent checks are not inferred.

| Constraint | Latest evidence | Predicate |
|---|---|---|
| `announcements_href_internal` | `packages/db/migrations/0013_site_content.sql:62` | `href IS NULL OR (href ~ '^/' AND href !~ '^//' AND href !~ '://')` |
| `announcements_message_en_length` | `packages/db/migrations/0030_english_content.sql:35` | `message_en IS NULL OR char_length(btrim(message_en)) BETWEEN 1 AND 160` |
| `announcements_message_length` | `packages/db/migrations/0013_site_content.sql:55` | `char_length(btrim(message)) BETWEEN 1 AND 160` |
| `announcements_window_bounded` | `packages/db/migrations/0013_site_content.sql:60` | `ends_at <= starts_at + interval '90 days'` |
| `announcements_window_ordered` | `packages/db/migrations/0013_site_content.sql:57` | `ends_at > starts_at` |
| `content_images_byte_size` | `packages/db/migrations/0022_content_images.sql:42` | `byte_size > 0 AND byte_size <= 10485760` |
| `content_images_dimensions` | `packages/db/migrations/0022_content_images.sql:44` | `width > 0 AND height > 0` |
| `content_images_key_shape` | `packages/db/migrations/0022_content_images.sql:38` | `storage_key ~ '^content/[0-9a-z-]+/[0-9a-f]{24}\.(jpg / png / webp)$'` |
| `content_images_type` | `packages/db/migrations/0022_content_images.sql:40` | `content_type IN ('image/jpeg', 'image/png', 'image/webp')` |
| `content_pages_draft_en_is_array` | `packages/db/migrations/0030_english_content.sql:42` | `jsonb_typeof(draft_blocks_en) = 'array'` |
| `content_pages_draft_is_array` | `packages/db/migrations/0009_content.sql:73` | `jsonb_typeof(draft_blocks) = 'array'` |
| `content_pages_slug_length` | `packages/db/migrations/0009_content.sql:67` | `char_length(slug) BETWEEN 1 AND 80` |
| `content_pages_slug_shape` | `packages/db/migrations/0009_content.sql:66` | `slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'` |
| `content_pages_title_en_present` | `packages/db/migrations/0030_english_content.sql:40` | `title_en IS NULL OR char_length(btrim(title_en)) > 0` |
| `content_pages_title_present` | `packages/db/migrations/0009_content.sql:68` | `char_length(btrim(title)) > 0` |
| `content_revisions_blocks_en_is_array` | `packages/db/migrations/0030_english_content.sql:50` | `jsonb_typeof(blocks_en) = 'array'` |
| `content_revisions_blocks_is_array` | `packages/db/migrations/0009_content.sql:93` | `jsonb_typeof(blocks) = 'array'` |
| `content_revisions_blocks_present` | `packages/db/migrations/0009_content.sql:94` | `jsonb_array_length(blocks) > 0` |
| `customers_phone_shape` | `packages/db/migrations/0001_constraints.sql:67` | `phone ~ '^(\+201 / 01)[0-2,5]{1}[0-9]{8}$'` |
| `line_items_bps_sane` | `packages/db/migrations/0001_constraints.sql:32` | `commission_bps BETWEEN 0 AND 10000` |
| `line_items_line_reconciles` | `packages/db/migrations/0001_constraints.sql:33` | `line_piastres = unit_price_piastres * quantity` |
| `line_items_quantity_positive` | `packages/db/migrations/0001_constraints.sql:30` | `quantity > 0` |
| `login_codes_attempts_sane` | `packages/db/migrations/0025_login_codes.sql:93` | `attempts >= 0` |
| `login_codes_audience_known` | `packages/db/migrations/0025_login_codes.sql:91` | `audience IN ('seller', 'platform')` |
| `login_codes_digest_shape` | `packages/db/migrations/0025_login_codes.sql:92` | `code_digest ~ '^[0-9a-f]{64}$'` |
| `note_glossary_ar_shape` | `packages/db/migrations/0030_english_content.sql:63` | `char_length(btrim(ar)) BETWEEN 1 AND 40` |
| `note_glossary_en_shape` | `packages/db/migrations/0030_english_content.sql:64` | `char_length(btrim(en)) BETWEEN 1 AND 40` |
| `orders_merchandise_non_negative` | `packages/db/migrations/0001_constraints.sql:24` | `merchandise_piastres >= 0` |
| `orders_shipping_non_negative` | `packages/db/migrations/0001_constraints.sql:25` | `shipping_piastres >= 0` |
| `orders_total_reconciles` | `packages/db/migrations/0001_constraints.sql:26` | `total_piastres = merchandise_piastres + shipping_piastres - discount_piastres` |
| `payout_lines_bps_sane` | `packages/db/migrations/0001_constraints.sql:37` | `commission_bps BETWEEN 0 AND 10000` |
| `payout_lines_net_reconciles` | `packages/db/migrations/0008_delivery_fulfilment.sql:69` | `net_piastres = gross_piastres - commission_piastres + shipping_piastres` |
| `platform_staff_phone_shape` | `packages/db/migrations/0007_platform_staff.sql:34` | `phone ~ '^(\+20 / 0)1[0125][0-9]{8}$'` |
| `platform_staff_role_known` | `packages/db/migrations/0007_platform_staff.sql:36` | `role IN ('operator', 'admin')` |
| `product_media_facts_all_or_none` | `packages/db/migrations/0021_media_facts.sql:35` | `(content_type IS NULL AND byte_size IS NULL AND width IS NULL AND height IS NULL) OR ( content_type IS NOT NULL AND content_type IN ('image/jpeg', 'image/png', 'image/webp') AND byte_size IS NOT NULL AND byte_size > 0 AND width IS NOT NULL AND width > 0 AND height IS NOT NULL AND height > 0 )` |
| `products_price_positive` | `packages/db/migrations/0012_archive_unpriced.sql:25` | `price_piastres > 0 OR (price_piastres = 0 AND status IN ('draft', 'archived'))` |
| `products_promo_valid` | `packages/db/migrations/0001_constraints.sql:17` | `promo_price_piastres IS NULL OR (promo_price_piastres > 0 AND promo_price_piastres < price_piastres)` |
| `products_stock_non_negative` | `packages/db/migrations/0001_constraints.sql:20` | `stock >= 0` |
| `products_volume_positive` | `packages/db/migrations/0012_archive_unpriced.sql:28` | `volume_ml > 0 OR (volume_ml = 0 AND status IN ('draft', 'archived'))` |
| `reviews_author_label_present` | `packages/db/migrations/0016_review_byline.sql:69` | `length(trim(author_label)) > 0` |
| `reviews_ratings_in_range` | `packages/db/migrations/0001_constraints.sql:55` | `rating_scent BETWEEN 1 AND 5 AND rating_longevity BETWEEN 1 AND 5 AND rating_projection BETWEEN 1 AND 5 AND rating_value BETWEEN 1 AND 5 AND rating_packaging BETWEEN 1 AND 5 AND rating_description_accuracy BETWEEN 1 AND 5` |
| `rule_set_bps_sane` | `packages/db/migrations/0001_constraints.sql:42` | `storefront_referral_bps BETWEEN 0 AND 10000 AND direct_repeat_bps BETWEEN 0 AND 10000 AND organic_search_bps BETWEEN 0 AND 10000 AND paid_campaign_bps BETWEEN 0 AND 10000 AND creator_affiliate_bps BETWEEN 0 AND 10000 AND email_crm_bps BETWEEN 0 AND 10000 AND unknown_bps BETWEEN 0 AND 10000` |
| `rule_set_two_approvers` | `packages/db/migrations/0001_constraints.sql:52` | `array_length(approved_by, 1) >= 2` |
| `sessions_audience_known` | `packages/db/migrations/0028_sessions.sql:71` | `audience IN ('seller', 'platform')` |
| `sessions_expires_after_issue` | `packages/db/migrations/0028_sessions.sql:76` | `expires_at > issued_at` |
| `sessions_revoked_after_issue` | `packages/db/migrations/0028_sessions.sql:77` | `revoked_at IS NULL OR revoked_at >= issued_at` |
| `sessions_seller_matches_audience` | `packages/db/migrations/0028_sessions.sql:74` | `(audience = 'seller') = (seller_id IS NOT NULL)` |
| `site_curation_featured_bounded` | `packages/db/migrations/0013_site_content.sql:90` | `array_length(featured_product_ids, 1) IS NULL OR array_length(featured_product_ids, 1) <= 12` |
| `site_curation_is_singleton` | `packages/db/migrations/0013_site_content.sql:88` | `singleton = true` |
| `sub_orders_dispatch_due_after_confirm` | `packages/db/migrations/0020_dispatch_clock.sql:93` | `dispatch_due_at IS NULL OR (confirmed_at IS NOT NULL AND dispatch_due_at > confirmed_at)` |
| `sub_orders_dispatch_sla_positive` | `packages/db/migrations/0020_dispatch_clock.sql:74` | `dispatch_sla_hours > 0` |
| `sub_orders_recipient_phone_shape` | `packages/db/migrations/0004_sub_order_delivery.sql:73` | `recipient_phone ~ '^(\+20 / 0)1[0125][0-9]{8}$'` |
| `support_tickets_message_present` | `packages/db/migrations/0017_support_message.sql:46` | `length(trim(message)) > 0` |
| `support_tickets_phone_shape` | `packages/db/migrations/0017_support_message.sql:42` | `contact_phone ~ '^(\+201 / 01)[0125]{1}[0-9]{8}$'` |
| `support_tickets_subject_present` | `packages/db/migrations/0017_support_message.sql:47` | `length(trim(subject)) > 0` |

## 12. Fresh static checks and input provenance

The repository guard was run without database access or file changes. Initial sandbox execution failed on Node path resolution (`EPERM`); the approved retry succeeded: **No hardcoded colours (322 files; 1 artwork exemption); Logical properties only.** No Vitest/build/typecheck/browser tests or migrations were run.

Handoff ZIP SHA-256: `982770261f5e2af5ec5c08732813dfe7700f7fb729f9f12a99dc818879d14b6a`. The full master prompt and all four proposed files were read from the ZIP without installing or applying its SQL.

| Input inside ZIP | SHA-256 |
|---|---|
| `CODEX_MASTER_PROMPT.md` | `8e588e22f3b4b2193bec9012376f381415996da5c95cd07e30eab7727a7f9cd7` |
| `references/proposed/DIYAR_TARGET_ERD_V2.mmd` | `1441282ab09c9e989ac56ce64058281542a4b8d034d630810136f9c2efa1f687` |
| `references/proposed/DIYAR_DATABASE_ARCHITECTURE_BLUEPRINT.md` | `463b0ee56da71ea616117548a43ab7cc9328cbc8a1fe2c62264a5b546a195208` |
| `references/proposed/DIYAR_EXTENSIBILITY_AND_GAPS.md` | `9ec0067e52e84f3ae3eeb2cc03788c10ef2abb5ae15dfb8d422d26f03a9f0008` |
| `references/proposed/ANALYTICS_AND_TENANT_CONTRACTS.md` | `c4e1a4f210e6260abd6667d85643853a4cb164097dec7afe9af58af15cff5652` |

## 13. Controlled enum vocabulary inventory

Current Drizzle enum declarations (schema parity test exists; not run here). SQL introductions in 0000 plus content/delivery/moderation/note-icon migrations.

| SQL enum | Current values | Evidence |
|---|---|---|
| `content_page_state` | `draft`, `in_review`, `published`, `archived` | `packages/db/src/schema/content.ts:15` |
| `delivery_fulfilled_by` | `seller`, `platform` | `packages/db/src/schema/enums.ts:20` |
| `seller_status` | `applied`, `under_review`, `approved`, `live`, `suspended`, `terminated` | `packages/db/src/schema/enums.ts:23` |
| `verification_control` | `owner_identity`, `payout_ownership`, `product_responsibility`, `labels_artwork`, `claims_evidence`, `return_route`, `service_capacity`, `privacy_contact` | `packages/db/src/schema/enums.ts:28` |
| `verification_status` | `pending`, `submitted`, `approved`, `rejected` | `packages/db/src/schema/enums.ts:32` |
| `staff_role` | `owner`, `manager`, `fulfilment`, `viewer` | `packages/db/src/schema/enums.ts:36` |
| `product_status` | `draft`, `pending_moderation`, `published`, `suspended`, `archived` | `packages/db/src/schema/enums.ts:39` |
| `concentration` | `parfum`, `eau_de_parfum`, `eau_de_toilette`, `eau_de_cologne`, `oil`, `attar`, `body_mist` | `packages/db/src/schema/enums.ts:42` |
| `product_form` | `spray`, `roll_on`, `dab`, `solid` | `packages/db/src/schema/enums.ts:45` |
| `gender_positioning` | `men`, `women`, `unisex` | `packages/db/src/schema/enums.ts:46` |
| `scent_family` | `oud`, `amber`, `woody`, `floral`, `fresh`, `gourmand`, `musk` | `packages/db/src/schema/enums.ts:47` |
| `note_tier` | `top`, `heart`, `base` | `packages/db/src/schema/enums.ts:50` |
| `season` | `spring`, `summer`, `autumn`, `winter` | `packages/db/src/schema/enums.ts:51` |
| `day_night` | `day`, `night`, `both` | `packages/db/src/schema/enums.ts:52` |
| `occasion` | `daily`, `work`, `evening`, `occasion`, `gift` | `packages/db/src/schema/enums.ts:53` |
| `projection_band` | `intimate`, `moderate`, `strong`, `enormous` | `packages/db/src/schema/enums.ts:54` |
| `longevity_band` | `weak`, `moderate`, `long`, `very_long` | `packages/db/src/schema/enums.ts:55` |
| `performance_source` | `seller_provided`, `platform_test`, `review_aggregate` | `packages/db/src/schema/enums.ts:61` |
| `return_eligibility` | `sealed_only`, `sealed_or_defect`, `defect_only`, `not_returnable` | `packages/db/src/schema/enums.ts:65` |
| `order_source` | `storefront_referral`, `direct_repeat`, `organic_search`, `paid_campaign`, `creator_affiliate`, `email_crm`, `unknown` | `packages/db/src/schema/enums.ts:71` |
| `touch_channel` | `storefront_referral`, `paid_campaign`, `creator_affiliate`, `email_crm`, `organic_search`, `direct` | `packages/db/src/schema/enums.ts:76` |
| `payment_method` | `cod`, `card`, `wallet` | `packages/db/src/schema/enums.ts:80` |
| `payment_state` | `pending`, `authorised`, `captured`, `failed`, `refunded`, `collected_on_delivery` | `packages/db/src/schema/enums.ts:81` |
| `sub_order_state` | `placed`, `awaiting_seller`, `confirmed`, `dispatched`, `delivered`, `rejected`, `cancelled`, `refused`, `returned` | `packages/db/src/schema/enums.ts:85` |
| `transition_actor` | `system`, `seller`, `customer`, `platform`, `courier` | `packages/db/src/schema/enums.ts:90` |
| `moderation_reason` | `prohibited_claim`, `missing_required_fields`, `unsupported_claim`, `misleading_media`, `implausible_pricing`, `duplicate_listing`, `restricted_ingredient` | `packages/db/src/schema/enums.ts:100` |
| `reason_code` | `out_of_stock`, `pricing_error`, `area_not_served`, `suspected_fraud`, `customer_request`, `platform_policy`, `payment_failed`, `seller_unresponsive`, `customer_refused`, `customer_unreachable`, `address_invalid`, `payment_not_ready`, `damaged_in_transit`, `wrong_item`, `not_as_described`, `defective`, `changed_mind` | `packages/db/src/schema/enums.ts:107` |
| `return_status` | `requested`, `approved`, `declined`, `in_transit`, `received`, `refunded`, `closed` | `packages/db/src/schema/enums.ts:114` |
| `cost_bearer` | `seller`, `platform`, `customer`, `courier`, `unallocated` | `packages/db/src/schema/enums.ts:119` |
| `payout_status` | `accruing`, `pending_review`, `approved`, `paid`, `disputed`, `held` | `packages/db/src/schema/enums.ts:122` |
| `adjustment_type` | `commission_reversal`, `shipping_correction`, `goodwill_credit`, `failed_delivery_charge`, `promotion_subsidy`, `manual_correction` | `packages/db/src/schema/enums.ts:125` |
| `audit_action` | `seller_status_change`, `verification_decision`, `listing_moderation`, `review_moderation`, `commission_rate_change`, `payout_approval`, `payout_adjustment`, `policy_change`, `staff_permission_change`, `privacy_request` | `packages/db/src/schema/enums.ts:131` |
| `consent_purpose` | `order_fulfilment`, `marketing_email`, `marketing_sms`, `marketing_whatsapp`, `analytics` | `packages/db/src/schema/enums.ts:137` |
| `privacy_request_type` | `export`, `delete`, `rectify` | `packages/db/src/schema/enums.ts:141` |
| `privacy_request_status` | `received`, `verifying`, `in_progress`, `completed`, `refused` | `packages/db/src/schema/enums.ts:142` |
| `ticket_priority` | `p0`, `p1`, `p2`, `p3` | `packages/db/src/schema/enums.ts:146` |
| `ticket_status` | `open`, `waiting`, `resolved`, `closed` | `packages/db/src/schema/enums.ts:147` |
| `governorate` | `cairo`, `giza`, `alexandria`, `qalyubia`, `sharqia`, `dakahlia`, `beheira`, `gharbia`, `monufia`, `kafr_el_sheikh`, `damietta`, `port_said`, `ismailia`, `suez`, `north_sinai`, `south_sinai`, `beni_suef`, `faiyum`, `minya`, `asyut`, `sohag`, `qena`, `luxor`, `aswan`, `red_sea`, `new_valley`, `matrouh` | `packages/db/src/schema/enums.ts:150` |
| `note_icon` | `bergamot`, `citrus`, `cardamom`, `saffron`, `jasmine`, `white_flower`, `rose`, `violet`, `bloom`, `leaf`, `sprig`, `palm`, `wood`, `oud`, `amber`, `musk`, `vanilla`, `incense`, `cool` | `packages/db/src/schema/enums.ts:158` |

## 14. Audit artifact verification

Final static verification: exactly seven requested artifacts; current ERD has 40 nodes (39 application tables, 468 application columns, 54 actual FK edges, plus the migration-ledger node); all 38 entity names in supplied V2 ERD have explicit dispositions in report 04; 22 findings and 15 acceptance-scenario groups are indexed. 652 full repository path:line references were checked for file existence and in-range line numbers. Markdown table/fence structure and Mermaid block/key structure were checked. No Mermaid renderer was installed or run, so this is structural validation, not a claimed visual render.

The 424-file implementation/configuration/governing-document fingerprint in section 10 remained unchanged at final verification. Only the seven files under docs/database-audit/ were created or edited for this audit. No prior orientation, source, migration, decision or debt file was changed. No integration/runtime/recovery tests were executed. A later authorized catalog inspection must compare the code-defined ERD to deployed reality.
