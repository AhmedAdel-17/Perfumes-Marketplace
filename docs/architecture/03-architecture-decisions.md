# 03 — Architecture Decision Records

Format: context → decision → consequences → status. **Status "proposed" means it needs the
technical founder's approval; "founder approval required" means doc 04 §9 applies (economics,
customer policy or security-critical architecture) and both founders must agree.**

Decisions already taken and recorded elsewhere are listed at the end so this file is the
complete index.

---

## ADR-01 · Continue on the current codebase with a scoped major refactor

**Context.** Audit verdict B (`04-gap-analysis.md` Part 3).
**Decision.** Keep the monorepo, packages, domain core, RLS model, tokens and CMS. Rebuild
settlement as a ledger; refactor order lifecycle, inventory, attribution, commission config,
auth adapters; add outbox, jobs, notifications, observability, deployment.
**Consequences.** No re-platform. Roadmap P0 is correctness, not features. The team keeps
the QA lessons and 1,000 tests.
**Status.** Proposed.

## ADR-02 · One web application, not three

**Context.** `TECH_STACK.md` §1 and `ARCHITECTURE.md` §2 describe `apps/web`, `apps/seller`,
`apps/admin`. The repository has one app with `/seller` and `/ops` route groups sharing the
composition root, the session modules and the design system.
**Decision.** Keep one deployable. Route groups stay; a future split (e.g. `admin.diyar.eg`)
is a Vercel domain mapping plus middleware, not a new app.
**Consequences.** One deploy, one env, one session model. Update both docs.
**Status.** Proposed.

## ADR-03 · Settlement is an append-only ledger; a payout settles entries exactly once

**Context.** C1/C2: the run recomputes and re-pays; refunds never reach settlement.
**Decision.** `ledger_entries` with UNIQUE `(sub_order_id, kind)` for earned/reversed;
entries created by events (reserve release, return received, refund, adjustment); payout
run = select unsettled → sum → stamp `settled_in_payout_id` in one transaction; payout
states draft → pending_review → approved → paid/held/void with two-person approval.
Amend trigger `payout_lines_completed_only` to permit reversal lines on `returned`.
**Consequences.** Historical statements reproducible from entries; `SettlementService`
classification survives as the posting rule; both settlement directions (pay vs invoice)
are a sign on the payout entry, keeping D-5 open without blocking.
**Status.** Proposed. **Founder approval required** for payout cadence, reserve and
two-person approval (economics/policy).

## ADR-04 · Transactional outbox for domain events; a cron-triggered job runner instead of pg_boss

**Context.** No jobs, no notifications. `TECH_STACK.md` chose `pg_boss` + `pg_cron`, but
`pg_boss` needs a long-lived worker and Vercel has none; running a separate worker host for
one team is avoidable complexity today.
**Decision.** Events are rows in `outbox` written in the producing transaction. Jobs are
idempotent commands behind `/api/jobs/{name}`, guarded by a shared secret, recorded in
`job_runs` with a unique `run_key`, triggered by Vercel Cron (or Supabase `pg_cron` +
`pg_net`; pick one, not both). Retry with backoff is in the job ledger.
**Consequences.** No new host. Latency of minutes, acceptable for every job listed.
Migration to `pg_boss` on a worker is a new adapter for `JobRunner` if volume demands it.
**Status.** Proposed.

## ADR-05 · Own phone-OTP identity with signed cookies; no Supabase Auth

**Context.** `TECH_STACK.md` said Supabase Auth. The implementation built its own: OTP
digests in Postgres with `SECURITY DEFINER` verification, HMAC cookies per audience,
per-request revocation. It is RLS-integrated through `app.actor_id`.
**Decision.** Keep the own implementation. Add a `sessions` table (server-side revocation,
future bearer tokens), a real `OtpSender`, and staff sign-in by `seller_staff.phone`.
Customers remain guests; an OTP-verified phone at checkout is a **configurable** step
(ADR-08).
**Consequences.** No vendor dependency for the most sensitive path; the code is already
proven. Update `TECH_STACK.md`.
**Status.** Proposed.

## ADR-06 · Stock is a movement ledger, reserved at placement

**Context.** C3.
**Decision.** `stock_movements` (reserve on placement, release on reject/cancel/refuse,
sell on dispatch, restock on return received, adjust by seller); `products.stock` maintained
by trigger; `FOR UPDATE` on the product row during reservation.
**Consequences.** No oversell; a house's stock edit becomes an `adjust` movement with a
revision. Cart still caps at available.
**Status.** Proposed.

## ADR-07 · Attribution capture: first-party touch trail in a cookie, persisted at placement

**Context.** C4. Doc 03 §3: every order tagged; windows and disputes in the agreement.
**Decision.** Storefront links (`/house/{slug}?ref=…` and a short `diyar.eg/h/{slug}`),
UTM campaign ids, creator codes and direct/organic entry are recorded as touches in an
`httpOnly` first-party cookie (capped list, timestamps) and copied to `attribution_touches`
when an order is placed; the resolver runs unchanged. Windows come from the active rule set.
**Consequences.** The 5% vs 15% mechanic starts operating; disputes are answerable from the
trail. Privacy: the cookie holds channel/ref/time only, no personal data; retention aligned
with A-1.
**Status.** Proposed. **Founder approval required**: attribution windows and the dispute
procedure (doc 03 §3) are commercial policy.

## ADR-08 · Checkout phone verification and COD risk controls are configurable policy

**Context.** H5, doc 06 §7 ("confirmation rules based on risk, not blanket friction"), D-2.
**Decision.** Add a `checkout_policy` setting: `none` | `otp_first_order` | `otp_always` |
`ops_call_over_amount`. Implement OTP-at-checkout and `risk_flags` (refusal history per
phone, manual review only). Default for pilot: `otp_first_order`.
**Consequences.** Fake COD orders stop; review forgery (M16) closes because the reviewing
phone was verified.
**Status.** Proposed. **Founder approval required** (customer policy).

## ADR-09 · Commission rules and fee terms are data, changed only through an audited two-person action

**Context.** C5; doc 04 §9.
**Decision.** `CommissionPolicy` is constructed from the active `commission_rule_sets` row
(+ overrides, + `seller_fee_terms` with fee model and minimum fee). A rule-set change is a
draft by one admin, approved by a second, audited, effective from a date; placement
snapshots version and bps as today.
**Consequences.** D-4 becomes a row, not a deploy. Illustrative 5% seller-originated fee
(doc 03 §5) can gain a minimum fee without code.
**Status.** Proposed. **Founder approval required** for actual rates (D-4).

## ADR-10 · Web app reads go through the API facade; no direct SQL in `apps/web`

**Context.** H8.
**Decision.** Move `core/catalogue.ts` queries into `catalogue.*` procedures (RLS as
`anon`), identity lookups into an `IdentityRepository` used by the session modules. Only
composition roots (`db.ts`, `login-codes.ts`, `media.ts`) may import `@diyar/db`. Add a
test like `dependency-rule.test.ts` for `apps/web`.
**Consequences.** One data path, RLS on every read, native apps get the same procedures.
**Status.** Proposed.

## ADR-11 · Notifications: SMS first, WhatsApp templates second, via the outbox

**Context.** H2. Egyptian buyers and sellers live on WhatsApp; SMS is universal and
cheapest to start.
**Decision.** `Notifier` port with per-channel adapters (Strategy) and a template registry
(Template Method) in `packages/domain/notifications` (pure). Events: order placed (customer,
house), confirmed, dispatched (+tracking), delivered (+review link), rejected/cancelled,
return decisions, SLA warnings (house), payout drafted/approved (house owner). One-time
codes use the same SMS adapter.
**Consequences.** Vendor choice (`SMSMisr`/`Victory Link` vs Twilio) is an adapter; the
deliverability risk noted in `TECH_STACK.md` §9 is contained.
**Status.** Proposed. **Founder decision**: vendor and WhatsApp Business verification.

## ADR-12 · Mobile work stops until the Phase 2 gate; the HTTP boundary stays

**Context.** X2 in `CURRENT_ASSUMPTIONS.md`: doc 04 §10 defers native apps; WORK_PLAN §11–13
builds toward them.
**Decision.** Keep 11.1 (HTTP boundary) and 11.2 (durable codes) — both serve the web.
Do not build 11.3–13 until doc 03 §10's condition ("repeat direct usage proves
installation improves retention") is evidenced. Remove Redux/NativeWind language from
engineering docs' MVP scope.
**Consequences.** Engineering capacity goes to P0/P1.
**Status.** Proposed. **Founder approval required** (contradicts the standing WORK_PLAN).

## ADR-13 · Forward-only migrations with expand/contract; no down scripts

**Context.** M13; ENGINEERING_PRINCIPLES §6 says "reversible migration".
**Decision.** Migrations are forward-only (as built). "Reversible" means every migration
is additive or two-phase (expand → deploy → contract in a later migration) so a rollback
of the application never needs a schema rollback. Each file carries a `-- rollback:` note.
**Consequences.** Safe redeploy of the previous build at any time.
**Status.** Proposed.

## ADR-14 · Observability baseline: Sentry, JSON logs with request and order correlation, four alerts

**Context.** H9; doc 04 §5 observability row.
**Decision.** See `09-observability.md`. Non-negotiable before pilot.
**Status.** Proposed.

## ADR-15 · Frontend: keep the identity and tokens; redesign the journey and add a tool design system

**Context.** Founder finds the frontend unsatisfactory; doctrine and reference exist.
**Decision.** See `docs/frontend/04-redesign-plan.md`. No new palette, no component kit;
a second, denser type/spacing ramp for operating tools; trust and comparison layers on the
shopfront; photography as a seller-onboarding requirement.
**Status.** Proposed. **Founder approval required** for the direction (design is the
binding constraint, CLAUDE.md §12).

---

## Decisions already on record (not repeated here)

| Where | Decision |
|---|---|
| `OPEN_DECISIONS.md` | D-1 name DIYAR (pending screening); A-1 guest analytics; A-2 cost entry method; M-1 R2; S-1 staff roles; delivery-fee principle |
| `TECH_STACK.md` §11 | CMS built in-house, not Payload |
| `DESIGN_DOCTRINE.md` §7 | two themes, roles not primitives |
| `ARCHITECTURE.md` | the dependency rule; PGlite single-writer; never build while dev runs |
