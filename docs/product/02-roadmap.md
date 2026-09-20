# Product and engineering roadmap

Starts from the real state (`01-mvp-readiness.md`). Complexity: S ≤ 2 days · M ≤ 1 week ·
L ≤ 3 weeks, for one senior engineer. "Dependency" names what must land first. Every task
carries the doc 04 §9 change-control fields in shorthand: problem · evidence · metric ·
owner · legal · cost.

Tiers: **P0** correctness/security/business correctness (before pilot) · **P1** MVP
stabilisation (before production) · **P2** frontend redesign · **P3** operational maturity ·
**P4** growth · **P5** future.

---

## P0 — MUST FIX BEFORE PILOT (≈ 6–8 engineer-weeks)

| # | Task | Objective | Why it matters | Dep. | Cx | Modules | Migration risk | Acceptance |
|---|---|---|---|---|---|---|---|---|
| 1 | **Ledger + payout rebuild** (ADR-03) | append-only `ledger_entries`, `settled_in_payout_id`, payout states, two-person approval, `markPaid` | C1: houses paid repeatedly | — | L | domain/money, db, api/platform, seller statement screen | new tables; existing `payouts`/`payout_lines` kept read-only; trigger amended | a sub-order settles exactly once (test); a second run is empty; statement reproducible; approval audited |
| 2 | **Return → sub-order → ledger → refund** | return `received` transitions to `returned`; reversal entries; refund entry with cost bearer; payment refund hook | C2 | 1 | M | domain/trust, orders, money; api/returns | trigger `payout_lines_completed_only` widened for `returned` | refund reduces the next statement; negative balance carried; gate-4 table rows tested |
| 3 | **Reachable cancel and refuse** | `orders.cancel` (customer, pre-dispatch, verified phone), `platform.cancel`, `platform.markRefused` (reason, attempts, cost bearer) | C6 | 1 | M | api/orders, platform; domain policies | none | all nine states reachable by tests; refusal rate by governorate shows real data |
| 4 | **Stock movements** (ADR-06) | reserve at placement, release on reject/cancel/refuse, sell on dispatch, restock on return | C3 | — | M | domain/orders, db | `products.stock` becomes derived; one-off backfill movement | oversell impossible under concurrent placement test |
| 5 | **Idempotent placement + locked transitions** | `idempotency_keys`; `FOR UPDATE` + compare-and-set in `applyTransition` | H1, H13 | — | S | api, db | none | replay returns same order; concurrent confirm produces one transition |
| 6 | **Attribution capture** (ADR-07) | first-party touch cookie from storefront links, UTM, creator codes, direct/organic; persisted to `attribution_touches`; resolver wired | C4 | — | M | web middleware, api/orders, domain | none | a storefront-referred order is `storefront_referral` at 5 %; an organic one at the marketplace rate; trail visible on the order in ops |
| 7 | **Commission rules from the database** (ADR-09) | `CommissionRuleRepository`; admin screen: draft → second approver → effective date; `seller_fee_terms` with minimum fee | C5, gate 6 | — | M | domain/money, db, api/admin, ops UI | seed the current constant as version 1 | rate change audited; placement snapshots the active version |
| 8 | **Real SMS adapter** for codes | Egyptian aggregator + Twilio fallback behind `OtpSender`; codes never logged | H4 | — | S | api/providers (→ integrations) | none | production boots with no stub; a code arrives on a real phone from staging |
| 9 | **Outbox + job runner** (ADR-04) | `outbox`, `job_runs`, `/api/jobs/*`, Vercel Cron; `dispatch-outbox`, `release-reserve`, `watch-sla`, `purge` | H3, DEBT #5, #4 | 1 | M | db, api, infra | none | each job observed running; a duplicate trigger is a no-op |
| 10 | **Notifications v1** (ADR-11) | `Notifier` port, SMS adapter, templates: order received, new order (house), confirmed, dispatched + tracking link, delivered + review link, rejected/cancelled, SLA warning | H2 | 8, 9 | M | domain/notifications, integrations, outbox | none | every transition produces exactly one message per recipient (unique constraint) |
| 11 | **Checkout phone verification + risk flags** (ADR-08) | `checkout_policy` setting; OTP step; `customers.verified_at`; `risk_flags` | H5, M16 | 8 | M | api/orders, web checkout | none | policy `otp_first_order` default; forged review test fails |
| 12 | **Web reads through the API** (ADR-10) | move `core/catalogue.ts` into `catalogue.*`; `IdentityRepository` for sessions; app-level dependency-rule test | H8 | — | M | web, api | none | no `@diyar/db` import outside composition roots |
| 13 | **Observability baseline** (ADR-14) | request id, JSON logs, Sentry, four alerts with owners, uptime check | H9 | — | S | web, api | none | an induced error appears in Sentry with request id and order ref |
| 14 | **Deployment** | GitHub remote, `main`, branch protection, Vercel + Supabase staging/prod, migrations in CI, PITR, R2 buckets, secrets, kill switches | H12 | — | M | infra | none | staging reachable; restore drill recorded; launch checklist ticked |
| 15 | **Gate-4 test suite first** | integration tests for every row of `08 §3`; property test for "settled once" | T1 | — | S | db, domain | none | tests exist and fail before tasks 1–4, pass after |
| 16 | **Founder decisions recorded** | D-2, D-4 pilot rates, D-5 direction, D-7, Phase 0 skip, payout cadence, notification vendor, checkout policy | governance | — | S | docs | — | `OPEN_DECISIONS.md` updated with dates |

## P1 — MVP STABILISATION (MUST FIX BEFORE PRODUCTION)

| # | Task | Objective | Dep. | Cx | Acceptance |
|---|---|---|---|---|---|
| 17 | Payments entity + Paymob adapter + webhooks | `payments`, `payment_events`, card/wallet authorise/capture/fail/refund; failed → cancel | P0 1–5, 9 | L | sandbox card order end to end; duplicate webhook is a no-op; failed payment cancels and releases stock |
| 18 | Bosta adapter + tracking | booking, label, tariff by governorate (`ShippingQuoter`), tracking webhook/poll → delivered/refused with codes | 3, 9 | L | a real parcel's events drive the state; refusal codes recorded |
| 19 | Seller staff roles (S-1) | enum migration, sign-in by staff phone, permission map, RLS per role, staff screen | 8 | M | matrix in `05 §2` proven by RLS tests |
| 20 | Rate limits in the database + Cloudflare rules | DEBT #2 | 14 | S | two instances share a counter |
| 21 | Seller contact isolation | DEBT #3 | — | S | anonymous read of `sellers` exposes no contact columns |
| 22 | Sessions table + revocation | ADR-05 | — | S | sign-out-everywhere works |
| 23 | Privacy request workflow + consent records | doc 04 §5; pending counsel wording | 11 | M | export bundle and pseudonymisation tested |
| 24 | Security headers, CI dependency audit, browser suite in CI | M17, T2 | 14 | S | headers present; CI runs e2e |
| 25 | Exception report + remittance reconciliation + payout adjustments screen | doc 06 §12–13 | 1, 9 | M | report delivered daily; mismatches listed |
| 26 | Seller suspension effects | M19 | 3 | S | policy documented; open sub-orders handled |
| 27 | Docs reconciliation | ARCHITECTURE, TECH_STACK, WORK_PLAN, CLAUDE.md §13 corrected (ADR-02/05/12) | — | S | no doc describes a nonexistent app |

## P2 — FRONTEND REDESIGN (see `docs/frontend/04-redesign-plan.md`)

| # | Task | Cx | Dep. |
|---|---|---|---|
| 28 | R0 foundations: primitives package, loading/error, skeletons, Atelier tokens | M | — |
| 29 | R1 trust without redesign: verified line, ratings on tiles, `TrustRow`, house panel, SMS tracking link | M | 10 |
| 30 | R2 tools: seller dashboard + queue table, ops order search + customer timeline + exceptions | L | 25 |
| 31 | R3 journey: home IA, search layout, compare, product above-the-fold, checkout steps, tracking timeline, storefront | L | 28–30, FD-1..7 |
| 32 | R4 polish: motion, photography guide + paid shoot programme, structured data, ISR, visual regression | M | 31 |

## P3 — OPERATIONAL MATURITY

Runbooks (incident, rotation, restore, payout day); support SLA timers (doc 06 §9); seller
performance indicators and enforcement ladder screen (doc 06 §11); monthly payout audit
export; Metabase or equivalent read replica when `/ops/insights` no longer suffices;
WhatsApp channel; Supabase Realtime for the queue if polling proves insufficient.

## P4 — GROWTH (Phase 2 in doc 04 §7; only after repeat/direct evidence)

Promotion codes and campaigns with subsidy bearer; creator/affiliate codes with payouts;
sponsored placement with labels separated from organic ranking; wishlist; loyalty
readiness (referral complete event); search improvements (trigram index, facets with
counts, synonyms); customer account claim (`customers.claimed_at`); English locale (D-3);
seller analytics (attributed source reporting).

## P5 — FUTURE CAPABILITIES (Phases 3–4; gated by evidence)

Native buyer and seller apps (11.3–13 resume only after doc 03 §10's retention evidence);
selected inventory and combined shipping (order density); sampling/showroom; AI scent
matching (after review/preference data); international.

---

## Recommended next 30 engineering tasks, in order

1 Gate-4 tests (15) · 2 Ledger tables + posting rules (1a) · 3 Payout run on ledger + states
(1b) · 4 Approve/mark-paid + audit (1c) · 5 Return→returned→reversal (2) · 6 Refund entries
(2) · 7 Stock movements (4) · 8 Idempotency keys (5) · 9 Locked transitions (5) · 10 Cancel
paths (3) · 11 Refuse path with cost bearer (3) · 12 Attribution cookie + middleware (6) ·
13 Persist touches + wire resolver (6) · 14 Commission rule repository + seed v1 (7) ·
15 Admin rules screen with two approvers (7) · 16 SMS adapter (8) · 17 Outbox + job ledger
(9) · 18 Jobs: dispatch-outbox, release-reserve (9) · 19 Jobs: watch-sla, purge (9) ·
20 Notifier port + templates (10) · 21 Wire six notifications (10) · 22 Checkout OTP + policy
(11) · 23 Risk flags (11) · 24 Catalogue reads via API (12) · 25 Identity repository (12) ·
26 Request id + logs + Sentry (13) · 27 Alerts + uptime (13) · 28 Remote, `main`, CI fix,
staging (14) · 29 Production project, PITR, restore drill (14) · 30 Record founder decisions
and reconcile docs (16, 27).

Then P1 17–26 and P2 28–32.
