# 04 — Architecture audit, gap analysis and the decision

Part 1 is the **audit** (Phase 2): every issue found, with severity and action.
Part 2 is the **gap table** (Phase 4): current vs target per component.
Part 3 answers **"is the current implementation good enough to continue building on?"**

Severity: CRITICAL = money or order correctness is wrong today · HIGH = blocks a safe pilot ·
MEDIUM = blocks production or erodes trust · LOW = hygiene.
Action: KEEP · REFACTOR · REBUILD · REMOVE · DEFER.

---

## Part 1 — Audit findings

### 1.1 Money, orders, payouts (the high-risk domain)

| ID | Sev | Finding | Evidence | Action |
|---|---|---|---|---|
| C1 | CRITICAL | **A payout run pays the same sub-order on every run.** `listForSettlement(sellerId)` returns all of a house's sub-orders with no period filter and no "already settled" marker; `payouts.save` inserts a line per `earned` sub-order; `payout_lines_unique` is only per payout. | `packages/db/src/repositories.ts:567`, `packages/api/src/routers/platform.ts` `runPayout` | REBUILD payout as a ledger (06 §2.4) |
| C2 | CRITICAL | **A refund never reaches the ledger.** `returns.resolve → refunded` records an amount on `returns` and an audit row; the sub-order stays `delivered`, settlement keeps classifying it `earned`. Even with a `returned` transition the trigger `payout_lines_completed_only` refuses the negative commission line the domain would produce. | `routers/returns.ts:270–340`, `migrations/0001_constraints.sql:290–308`, `settlement-classify.ts` | REFACTOR: return `received` → sub-order `returned` → ledger reversal; amend trigger |
| C3 | CRITICAL | **No stock reservation or decrement.** The cart caps quantity at `products.stock`; nothing changes stock when an order is placed, rejected or returned. | grep: no write to `products.stock` outside `listings.save` | REFACTOR: `stock_movements` + reserve at placement, release on reject/cancel |
| C4 | CRITICAL (business) | **Attribution is inert.** `orders.place` passes `touches: []`; nothing writes `attribution_touches`; no storefront link, UTM or creator code is captured. Every order is `unknown` at 5%. The central mechanic of doc 03 does not operate. | `routers/orders.ts` step 4; grep | REFACTOR: touch capture (cookie trail) + write at placement |
| C5 | CRITICAL (governance) | **Commission rates are a constant.** `CommissionPolicy` defaults to `DEFAULT_RULE_SET`; `commission_rule_sets`/`commission_overrides` are never read. A fee change is a code deploy, not an audited admin action (gate 6). | grep `commission_rule_sets` | REFACTOR: `CommissionRuleRepository` + admin screen + audit |
| C6 | CRITICAL | **`cancelled`, `refused` are unreachable; `returned` only via C2.** No procedure lets a customer or operator cancel, no path marks a refusal. Gate 4 ("cancelled, refused, returned and failed-payment reconcile") is not met despite the plan marking it done. | procedure inventory; grep for `'cancelled'`/`'refused'` in routers | REFACTOR: add `orders.cancel` (customer, by reference+phone, pre-dispatch), `platform.markRefused` (reason, cost bearer), courier webhook later |
| H1 | HIGH | **No idempotency on `orders.place`.** A retried request (double tap, flaky network, native client retry) creates two orders; the only guard is the button's disabled state. | `routers/orders.ts` | REFACTOR: `idempotency_keys` + client-generated key |
| H13 | HIGH | **Transitions read-then-write without a lock.** Two concurrent confirms both read `awaiting_seller`; the second `UPDATE` sees `OLD=NEW` and the trigger lets it through, writing a duplicate transition row. | `repositories.ts applyTransition`, trigger line 258 | REFACTOR: `FOR UPDATE` + compare-and-set on state |
| M2 | MEDIUM | COD remittance is recorded but never reconciled against `shipments.cod_amount_piastres`; `orders.payment_state` never leaves `pending`. | `recordRemittance` | REFACTOR with `payments` entity |
| L4 | LOW | `payouts.status` never advances; no "mark paid", no bank reference. | schema + routers | REFACTOR (part of C1) |
| A7 | HIGH (decision) | The settlement model assumes the **platform receives COD cash** from the courier. While houses book their own courier, the courier remits to the **house**, so the platform must **invoice** commission rather than pay out a net. The ledger is direction-agnostic; the payout run is not. | `settlement.ts` header, D-5 | DEFER to founder + PSP/counsel; build the ledger so either direction is a sign |

### 1.2 Architecture and backend

| ID | Sev | Finding | Action |
|---|---|---|---|
| H8 | HIGH | Web app queries Postgres directly as the owner role in `core/catalogue.ts` and both sign-in modules, bypassing the API facade and RLS. | REFACTOR: move catalogue reads into `catalogue` router procedures (they already exist for house/product) and an `IdentityRepository`; keep `db.ts`/`login-codes.ts` as composition roots |
| M11 | MEDIUM | Use-case orchestration lives in routers (`place`, `runPayout`, `resolve`, `dispatch`); domain has builders but no application services; no domain events. | REFACTOR gradually: extract `PlaceOrderUseCase`, `RunPayoutUseCase`, `ResolveReturnUseCase` into `packages/domain/services` taking ports; emit events via outbox |
| M12 | MEDIUM | Cross-cutting concerns (rate limit, audit) are hand-called per procedure rather than middleware/decorators as the registry prescribes. | REFACTOR: `rateLimited(rule)` and `audited(action)` procedure builders |
| M7 | MEDIUM | Engineering docs describe six apps, Supabase Auth, `packages/integrations`, `apps/jobs`; none exist. `WORK_PLAN` marks gate 4 met. | REFACTOR docs (ADR-02, ADR-05); correct the plan |
| L1 | LOW | Arabic label maps duplicated in `core/catalogue.ts` and `@diyar/i18n`. | REFACTOR into i18n |
| KEEP | — | Domain package, ports + in-memory double + contract suites, `Money`, state machine table, attribution chain, specifications, `DrizzleUnitOfWork` with GUC-scoped RLS, service roles with `WITH CHECK`, error mapping, production start-up guard, migration ledger. | KEEP |

### 1.3 Database

| ID | Sev | Finding | Action |
|---|---|---|---|
| — | — | Normalisation, CHECKs, triggers, RLS, snapshots: strong. | KEEP |
| C1/C2 | CRITICAL | No settlement marker; reversal forbidden by trigger. | see above |
| M13 | MEDIUM | No down migrations; no expand/contract convention written down. | REFACTOR: document forward-only + reversible-by-new-migration policy; add `-- rollback:` notes |
| M14 | MEDIUM | `seller_staff.role` enum (owner/manager/fulfilment/viewer) contradicts decision S-1 (manager/admin/operations/support). | REFACTOR migration |
| L5 | LOW | Missing indexes for SLA scans and phone lookups (06 §2.6). | REFACTOR when scheduling SLA jobs |
| L6 | LOW | `customer_addresses`, `consent_records`, `privacy_requests`, `webhook_events`, `shipment_events`, `commission_*` exist but are unused. | KEEP (schema ahead of code is fine); wire in roadmap |

### 1.4 Authentication and authorisation

| ID | Sev | Finding | Action |
|---|---|---|---|
| H4 | HIGH | SMS sender is a stub → seller and operator sign-in cannot run in production. | REFACTOR: real `OtpSender` adapter (P0) |
| H11 | HIGH | Only the house owner's phone resolves at sign-in; staff cannot sign in; roles unenforced except payouts (RLS `is_seller_owner`). Doc 04 §1 makes staff permissions an MVP requirement. | REFACTOR: resolve by `seller_staff.phone`; role → permission map from S-1; RLS per role for money and listings |
| M10 | MEDIUM | `platform_staff.role` is free text; only `admin` is checked (insights, publishing). No admin-vs-operator matrix. | REFACTOR: enum + matrix |
| M15 | MEDIUM | Seller session cookie has no server-side revocation list; revocation works only through the per-request staff lookup (fine) but a leaked cookie is valid 12h with no way to end it except revoking the staff row. | REFACTOR: `sessions` table with `revoked_at` (also needed for mobile bearer tokens later) |
| KEEP | — | HMAC cookies with constant-time compare, separate secrets and audiences, code digests in DB with attempt ceiling in a locked statement, same answer for unknown numbers, rate limit before send. | KEEP |

### 1.5 Security

| ID | Sev | Finding | Action |
|---|---|---|---|
| H5 | HIGH | Guest COD order under **any** phone number with no verification and no risk rules; doc 06 §7 requires validation and confirmation by risk. Enables fake orders against a house and refusal-rate poisoning. | REFACTOR: OTP-confirm the phone at checkout **or** ops confirmation call for first orders / high value (configurable, D-2) + `risk_flags` |
| H6 | HIGH | `sellers.contact_phone`/`contact_email` readable anonymously (DEBT #3). | REFACTOR (DEBT #3 plan) |
| H7 | HIGH | Rate limits are per process (DEBT #2). | REFACTOR: `rate_limit_windows` table |
| M16 | MEDIUM | Review forgery: a house sees reference + phone in its queue and can post a verified review for its own perfume. | REFACTOR: review submission requires the OTP-verified phone (same mechanism as H5) |
| M17 | MEDIUM | No CSP, no security headers configured in Next; no dependency scanning in CI (`audit:deps` is manual). | REFACTOR: headers in `next.config`, `audit:deps` in CI weekly |
| M18 | MEDIUM | Secrets: `.env.example` and start-up guard are good; no secret manager, no rotation procedure written. | REFACTOR: Vercel/Supabase env + rotation runbook |
| L7 | LOW | Tracking numbers, notes and addresses are free text rendered in React (escaped) — fine; `search_text` built server-side — fine. No injection found: Drizzle parameterises; the one `sql.raw` is the fixed role name. | KEEP |
| L8 | LOW | Logs print OTP codes (by design of the stub) — must not survive the real adapter. | REMOVE with H4 |

### 1.6 Marketplace-specific

| ID | Sev | Finding | Action |
|---|---|---|---|
| C4/C5 | CRITICAL | attribution and commission configuration (above). | |
| H14 | HIGH | No seller SLA monitoring: `confirm_due_at`/`dispatch_due_at` exist and count down on screen; nothing alerts before breach (doc 06 §5). | REFACTOR: job + notification |
| M19 | MEDIUM | No seller suspension effects on live orders (suspending a house hides listings but open sub-orders continue silently). | REFACTOR: policy + ops flow |
| M20 | MEDIUM | Sponsored placement / labels: not built (doc 04 admin requirements) — acceptable at MVP; curation exists and is not labelled as sponsorship. | DEFER (P4) with the label rule recorded |
| M21 | MEDIUM | Seller portal lacks attributed-source reporting and promotion codes (doc 04 §3). | DEFER to P1/P4 |
| KEEP | — | Multi-house cart with per-house shipping shown before payment; brand identity on every tile; prohibited-claims scanner; performance source disclosure; verified-purchase reviews only; one support route. | KEEP |

### 1.7 Operations

| ID | Sev | Finding | Action |
|---|---|---|---|
| H3 | HIGH | No scheduler or worker: reserve release, SLA alerts, analytics purge, media sweep, expired-code purge all unscheduled. | REBUILD (new): job runner (10-infrastructure §4) |
| H2 | HIGH | No notifications at all — customer never hears "confirmed/dispatched/delivered"; house never hears "new order". | REBUILD (new): notifier port + outbox |
| H9 | HIGH | No observability: no error capture, no request id, no metrics, no alert owner. | REBUILD (new): 09-observability |
| M22 | MEDIUM | No daily exception report (doc 06 §12/13), no reconciliation view. | REFACTOR into `/ops/insights` once ledger exists |
| M23 | MEDIUM | No backups verified, no recovery objective stated, no runbooks. | 10-infrastructure |

### 1.8 Frontend (summary; full audit in `docs/frontend/01-ux-audit.md`)

| ID | Sev | Finding | Action |
|---|---|---|---|
| F1 | HIGH | No loading/skeleton or error boundaries; server-action round trips with a bare "loading". | REFACTOR |
| F2 | HIGH | Trust layer thin: no verified-house mark, no rating on tiles, no return policy/delivery promise at the decision point, no comparison. | REFACTOR (redesign plan) |
| F3 | MEDIUM | Operating tools wear the storefront's type ramp; queue cards not scannable; no tables for lists >10. | REFACTOR (tool design system) |
| F4 | MEDIUM | Imagery: identical illustrated flacon across houses until photographs exist; no photography programme. | DECISION: photography is a seller-onboarding requirement |
| KEEP | — | Token discipline, roles/themes, RTL/a11y audit script, `counted()` plurals, server-side pricing, URL-carried filters. | KEEP |

### 1.9 Performance

| ID | Sev | Finding | Action |
|---|---|---|---|
| L9 | LOW | `seller.queue` runs one `findShipment` per dispatched row (N+1, small N). `listPublishedProducts()` is called on the product page to pick "others" (full table). Home fetches all products. | REFACTOR when catalogue > few hundred |
| L10 | LOW | Search is `LIKE '%term%'` on `search_text`; no trigram index. | DEFER until measured |
| KEEP | — | Fonts trimmed (three files), CLS 0, bundle ~100 KB shared, `next/image` with sizes, `force-dynamic` everywhere (no caching — acceptable now, revisit with ISR for product/house pages). | KEEP |

### 1.10 Testing

| ID | Sev | Finding | Action |
|---|---|---|---|
| — | — | 1,000 unit/contract/RLS/gate tests, ~130 browser scenarios, both adapters under one contract, negative verification practised. | KEEP |
| T1 | HIGH | The critical money defects (C1, C2, C6) have **no failing test** because no test asserts "a sub-order is settled at most once" or "a refund reverses". The test that would catch C1 does not exist. | REFACTOR: write them first (gate 4 first, as DATA_MODEL says) |
| T2 | MEDIUM | e2e needs a running dev server and its log; not run in CI. | REFACTOR: CI job with PGlite + built app |
| T3 | MEDIUM | No security tests beyond RLS (no CSRF/header/rate-limit-under-concurrency tests). | REFACTOR |

---

## Part 2 — Current vs target, per component

| Component | Current | Target (02) | Difference | Risk if unchanged | Migration cost | Business impact | Action |
|---|---|---|---|---|---|---|---|
| Monorepo, packages, dependency rule | pnpm + turbo; domain/db/api/i18n/tokens/ui; rule enforced by tests | same | none | — | — | — | **KEEP** |
| Application shape | one Next app, three route groups | one Next app + job runner entry | add jobs | none | low | — | **KEEP** (update docs) |
| Domain core | value objects, state machine, policies, builders, specifications | + application services + domain events | extraction | logic drifts into routers | medium | — | **REFACTOR** |
| Settlement/payout | statement recomputed from all sub-orders | append-only ledger, settled marker, payout states | model change | double payment, no reversal | medium (new tables, one router, tests) | **highest** | **REBUILD (this component)** |
| Returns/refunds | return entity only | return → sub-order → ledger → payment refund | wiring | unreconciled money | low-medium | high | **REFACTOR** |
| Inventory | advisory stock | stock movements, reserve/release | new table + hooks | oversell | low | high | **REFACTOR** |
| Attribution | resolver only | touch capture (link, UTM, creator code, cookie trail) + persistence | new capture layer | model inert | medium | **highest** | **REFACTOR** |
| Commission config | constant | DB rule sets, admin screen, audited, snapshotted | wiring | governance gap | low | high | **REFACTOR** |
| Order lifecycle | 5 of 9 states reachable | all reachable; locked transitions; events | new procedures | gate 4 unmet | low | high | **REFACTOR** |
| Payments | COD gateway | `payments` entity + Paymob adapter + webhooks | new | no e-payment | medium | medium (COD-first market) | **REFACTOR** (P1) |
| Courier | manual tracking | Bosta adapter + tracking webhook + refusal codes | new | ops toil | medium | medium | **REFACTOR** (P1) |
| Notifications | none | notifier port, SMS/WhatsApp adapters, templates, outbox | new | pilot unusable | medium | **high** | **REBUILD (new)** |
| Jobs | none | job runner + `job_runs` + cron trigger | new | SLA, reserve, purge undone | medium | high | **REBUILD (new)** |
| Auth (seller/ops) | own OTP + HMAC cookies, DB code store | same + real SMS + sessions table + staff roles | adapters | cannot go live | low-medium | high | **KEEP + REFACTOR** |
| Customer identity | guest by phone | guest + OTP-verified phone at checkout (configurable) + later claim | add | fraud | low | high | **REFACTOR** (D-2) |
| API | tRPC in-process + anonymous HTTP | same + idempotency + bearer for apps later | small | duplicates | low | — | **KEEP + REFACTOR** |
| RLS / roles | 9 roles, forced RLS | + `jobs` role, per-staff-role policies | small | — | low | — | **KEEP** |
| Web data access | direct SQL in 3 files | through routers/repositories | move | RLS bypass | low | — | **REFACTOR** |
| Media | R2 presigned, verified | same + sweep job | job | orphans | low | — | **KEEP** |
| CMS | own tables + editor | same | none | — | — | — | **KEEP** |
| Search | LIKE + normalisation | same + trigram index when needed | — | — | low | — | **KEEP** |
| Analytics | first-party events, owner report | same, reading the ledger | small | — | low | — | **KEEP** |
| Observability | none | Sentry + structured logs + request ids + alerts | new | blind in production | low | high | **REBUILD (new)** |
| Infra/CI | workflow file, no remote | GitHub + Vercel + Supabase + R2, staging, migrations in deploy | new | cannot deploy | low-medium | blocking | **REBUILD (new)** |
| Mobile | tokens/native export | — | — | — | — | — | **DEFER** (doc 04 §10) |
| Frontend shopfront | reference-matched, thin trust layer | journey-led redesign on the same identity | redesign | conversion | medium-high | high | **REFACTOR** (P2) |
| Frontend tools | storefront styling | tool design system (dense, tables, own ramp) | redesign | ops toil | medium | medium | **REFACTOR** (P2) |

---

## Part 3 — Is it good enough to continue building on?

### Evidence for

- **Architecture.** The dependency rule is real and machine-enforced. Ports exist for every
  external thing. Two adapters per port under one contract. RLS is scoped per transaction
  and tested through an unprivileged role. Money is integer and CHECKed at three layers.
  This is a better foundation than most funded marketplaces have at series A.
- **Business correctness of what exists.** Cart pricing, order fan-out, snapshots,
  transitions, publish gate, review gating, return policy windows, prohibited claims,
  Arabic search — all correct and tested.
- **Maintainability.** ~30k lines, nine runtime dependencies, strict types, comments that
  explain why, a QA record that explains what was missed and why.
- **Ability to satisfy docs 01–06.** Every entity in doc 04 §4 exists; six of eight gates are
  genuinely met or one step away.

### Evidence against

- **The money engine is wrong in three places that compound**: double payout (C1), refunds
  invisible to settlement (C2), and four order states nobody can reach (C6). Gate 4 is
  claimed and not met. Any pilot run on this code would produce wrong statements within one
  payout cycle.
- **The central business mechanic is inert** (C4, C5): the platform cannot earn the
  marketplace rate, cannot change a rate without a deploy, and cannot prove an attribution.
- **Nothing runs unattended**: no jobs, no notifications, no observability, no deploy.
- **Sign-in cannot go live** (H4); houses cannot sign in as staff (H11).

### Verdict

**B — CONTINUE + MAJOR REFACTOR**, scoped as follows:

1. **Rebuild one component**: settlement/payout, as an append-only ledger (06 §2.4). The
   current `SettlementService` classification logic survives as the rule that *creates*
   ledger entries; the run becomes a query over unsettled entries.
2. **Refactor the order lifecycle and money wiring**: reachable states, locked transitions,
   stock movements, return→ledger, payment entity, idempotency, attribution capture,
   DB-backed commission rules.
3. **Build the missing operational spine**: outbox events, job runner, notifier, SMS adapter,
   observability, deployment.
4. **Redesign the frontend as a product problem** (docs/frontend), keeping the identity and
   token system.
5. **Keep everything else.** Do not touch the domain package's tested logic except to add
   services and events; do not re-platform; do not add microservices, Redis, a search
   service or a component kit.

Not A because the money model needs a structural change, not patches. Not C or D because
nothing about the foundation is wrong; a rebuild would reproduce the same 30k lines with
fewer tests and none of the QA lessons.

**Estimated effort for the refactor tranche (P0 in `docs/product/02-roadmap.md`):** 6–8
engineer-weeks with one senior engineer, before any redesign.
