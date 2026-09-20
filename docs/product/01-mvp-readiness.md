# MVP readiness — honest state against doc 04 §8

`WORK_PLAN.md` reports seven of eight gates met. Reading the code, **three are met, three
are partially met, two are not met.** The difference is that the plan judged each gate by
"a screen exists", and the gates ask whether the *outcome* is correct.

| # | Gate (doc 04 §8) | Plan says | Audit says | Why |
|---|---|---|---|---|
| 1 | Seller approved → publishes a valid product → receives an **attributed** order → views its statement | ✅ | **partial** | Approval, publishing (with photograph), order and statement all exist. The order is not attributed (every order is `unknown`, C4) and the statement is wrong after the second payout run (C1). |
| 2 | Customer understands total shipping and completes COD/e-payment checkout without hidden costs | ✅ | **met (COD)** | Per-house fee and window before payment; total reconciles across four screens. E-payment absent by decision (doc 04: "as commercially available"). |
| 3 | Split order → correct seller tasks and customer tracking | ✅ | **met** | N sub-orders, own clocks, own queues, one tracking page. |
| 4 | Cancelled, refused, returned and failed-payment states reconcile | ✅ | **not met** | No path reaches `cancelled` or `refused`; `returned` never happens; refund never reaches settlement; failed payment cannot exist (C2, C6). |
| 5 | Only delivered orders create verified-purchase reviews | ✅ | **met** | Domain + router + trigger. Forgery by a house with the customer's phone remains possible until phone verification (M16). |
| 6 | Admin actions, fee changes and payout adjustments auditable | ✅ | **partial** | Moderation, payouts, remittance, refunds, content are audited. **Fee changes cannot happen** (rates are a constant, C5), so they are not auditable. Payout *adjustments* have a table and no screen. |
| 7 | Privacy, terms, seller agreement, return policy, prohibited-product controls live | partial | **partial** | Pages published; claims scanner live; consent records and privacy requests unbuilt; wording pending counsel. |
| 8 | Founder sees funnel, seller SLA and contribution inputs without database work | ✅ | **met** | `/ops/insights`; margin withheld until A-2 by design. |

## What "ready for a pilot" requires (MUST FIX BEFORE PILOT)

A pilot is real houses, real customers, real cash, on a small scale. It needs correctness
and a working loop more than features:

1. Payout ledger and reversal (C1, C2) — or no house is paid until it exists.
2. Reachable cancel / refuse; stock reservation; idempotent placement (C6, C3, H1).
3. Attribution capture and DB-backed commission rules (C4, C5).
4. Real SMS for sign-in codes and order notifications (H4, H2) — without notifications a
   house never learns it has an order.
5. Scheduler for reserve release, SLA warnings, purges (H3).
6. Observability and a deployed environment with backups (H9, H12).
7. Phone verification at checkout per the founder's policy (H5, ADR-08).
8. Recorded founder decisions: D-2, D-4 (pilot rates), D-5 direction (invoice vs pay),
   D-7, Phase 0 skip, payout cadence.

## MUST FIX BEFORE PRODUCTION (beyond pilot)

Paymob card/wallet; Bosta booking and tracking; seller staff roles as decided; rate limits
in the database; seller contact isolation; privacy request process; security headers;
CI-run browser suite; exception report; frontend R1–R2.

## NICE TO HAVE

Comparison (R3), house marks and banners, structured data, ISR, visual regression, seller
performance indicators screen, promotion codes.

## DO NOT BUILD YET

Native apps (WORK_PLAN 11.3–13), warehouse, showroom, AI matching, designer-name search or
comparison, platform-held balances / split settlement, loyalty points redemption,
international, open self-approval.

## Phase gate status (doc 04 §7)

Phase 0's exit condition — real seller-routed completed orders — has not been met and the
decision to build Phase 1 first is unrecorded. **Recommendation:** record it, and run the
Phase 0 validation sprint (doc 02 §9) *on* the built product with operations done by hand
(manual courier, manual remittance), after the P0 correctness tranche. The software becomes
the instrument of validation rather than its reward.
