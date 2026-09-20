# Technical debt — the complete register after the audit

`docs/DEBT_REGISTER.md` lists five items. It is accurate for what it lists and incomplete:
the standing directive says "debt not in the register does not exist", and the audit found
debt that was not known, which is a different thing from debt that was hidden. This file is
the full list; the entries marked **→ register** should be copied into `DEBT_REGISTER.md`
with owner and date by the technical founder.

## Correctness debt (money and orders) — not previously registered

| # | What | Cost to fix | Trigger | Roadmap |
|---|---|---|---|---|
| D-C1 → register | Payout run re-pays every eligible sub-order; no settled marker | ~1 week (ledger) | before the first real payout | P0-1 |
| D-C2 → register | Refund/return never reaches settlement; trigger forbids reversal | ~3 days | before the first real return | P0-2 |
| D-C3 → register | No stock reservation | ~3 days | before two customers can buy the last unit | P0-4 |
| D-C4 → register | Attribution touches never captured; every order `unknown` | ~1 week | before any marketplace-rate order is billed | P0-6 |
| D-C5 → register | Commission rates constant; rule-set table unread | ~4 days | before the first rate negotiation | P0-7 |
| D-C6 → register | `cancelled`/`refused` unreachable | ~4 days | before pilot | P0-3 |
| D-H1 → register | No idempotency on placement | ~1 day | before pilot | P0-5 |
| D-H13 → register | Transitions unlocked; duplicate transition rows possible | ~1 day | before pilot | P0-5 |

## Registered debt (kept, with the audit's view)

| # | Register entry | Audit view |
|---|---|---|
| 1 | Login-code store built, callers to be wired | **Now wired in the uncommitted working tree** (five files). Commit it; the remaining condition is the SMS sender (P0-8). |
| 2 | In-process rate limits | P1-20; raise priority if more than one instance before then |
| 3 | Seller contact columns readable anonymously | P1-21 |
| 4 | Orphaned media files | P0-9 purge job |
| 5 | Analytics purge unscheduled | P0-9 purge job |

## Structural debt

| # | What | Cost | Roadmap |
|---|---|---|---|
| D-S1 → register | Web app queries Postgres directly in three files (RLS bypass, second data path) | ~3 days | P0-12 |
| D-S2 | Use-case orchestration in routers; no application services; no domain events | incremental with P0 tasks | P0 |
| D-S3 | Cross-cutting (rate limit, audit) hand-called per procedure | ~2 days for builders | P0-7/P1 |
| D-S4 | `seller_staff.role` enum contradicts S-1 | migration + code | P1-19 |
| D-S5 | Docs describe six apps / Supabase Auth / integrations package that do not exist; WORK_PLAN marks gate 4 met | ~1 day | P1-27 |
| D-S6 | No `loading.tsx`/`error.tsx`, no skeletons, no primitives package | ~1 week | P2-28 |
| D-S7 | Arabic label maps duplicated in `core/catalogue.ts` | ~1 hour | with P0-12 |
| D-S8 | Forward-only migrations without an expand/contract statement | ~1 hour docs | ADR-13 |

## Operational debt

| # | What | Roadmap |
|---|---|---|
| D-O1 | No observability | P0-13 |
| D-O2 | No scheduler | P0-9 |
| D-O3 | No notifications | P0-10 |
| D-O4 | No deploy, remote, staging, backups; CI on wrong branch | P0-14 |
| D-O5 | Browser suite not in CI; needs dev log for codes | P1-24 |
| D-O6 | `payouts.status` never advances; no mark-paid | P0-1 |

## Debt the audit chose **not** to call debt (deliberate scope, recorded elsewhere)

COD-only payments · manual courier · flat shipping rate · no comparison/wishlist · no
sponsored placement · no English · PGlite in development · guest-only customers. Each is a
recorded decision or an open decision, not a shortcut.

## Policy going forward

- Every P0 task closes its register line in the same PR.
- A test that can fail is written before each correctness fix (QA method, kept).
- "Gate met" in any plan requires a named test per gate clause, not a screen.
