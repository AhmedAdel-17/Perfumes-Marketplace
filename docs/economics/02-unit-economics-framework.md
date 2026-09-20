# Unit economics framework

A worksheet, not a forecast (doc 03 §9). Three scenarios — LOW, BASE, HIGH — are defined by
**which inputs move**, not by numbers. Every cell is filled only from a quote, a contract or
pilot data, with its evidence rank (doc 02 §3).

## 1. Inputs

| Input | Unit | Evidence source (rank) | Today | Sensitivity |
|---|---|---|---|---|
| AOV (completed) | EGP | orders (1) | 3 seed products at 290–450 EGP (FACT, not data) | high |
| Share seller-originated vs marketplace | % | attribution (1) | 100 % unknown (inert) | highest |
| Rate, seller-originated | % or fee model | seller agreements (3) | 5 % constant (hypothesis) | high |
| Rate, marketplace | % | agreements (3) | 15 % constant | high |
| Minimum fee / subscription | EGP | D-4 | none | medium |
| Payment method mix | % COD vs card | orders (1) | 100 % COD | high (via refusal) |
| PSP fee | % + EGP | PSP contract (4); cited ~2.75 % + EGP 3 | not contracted | medium |
| COD collection fee | EGP or % | courier contract (4) | not contracted | medium |
| Delivery tariff by governorate | EGP | courier contract (4) | flat EGP 55 placeholder | medium (customer pays) |
| First-attempt failure / refusal rate | % | shipments (1); cited 20–35 % national COD | unobservable today | highest |
| Failed-attempt charge | EGP | courier (4) | unknown | high |
| Return rate and refund cost | %, EGP | returns (1) | unobservable (state unreachable) | medium |
| Support tickets per order and cost basis | n, EGP | tickets (1); A-3 | count only | low if salaried |
| Promo and creator cost | EGP | policy | zero | Phase 2 |
| Fraud loss | EGP | cases | none recorded | low early |
| Orders per house per month | n | orders (1) | none | high (fixed-cost coverage) |
| Active houses | n | status (1) | 3 seeded | high |
| Monthly fixed cost | EGP | budget (D-9) | ~$80–120 hosting + people | — |
| CAC per customer (demand side) | EGP | attributed spend | none | Phase 2 |
| CAC per house (supply side: shoots, onboarding time) | EGP | ledger of onboarding spend (new) | none | medium |
| 90-day repeat | % | cohorts (1) | none | high for LTV |

## 2. Scenario definitions (which inputs move)

| Scenario | Defined by | What it tests |
|---|---|---|
| **LOW** | seller-originated share stays dominant; COD-only; refusal at the high end of the cited range; no minimum fee; repeat low | can the low fee carry the company at all? (doc 03 §5 says barely) |
| **BASE** | mix shifts toward marketplace with campaigns; some card share; refusal at the low end of the cited range with phone verification; a minimum fee or pass-through of payment cost | the pack's working model |
| **HIGH** | marketplace share material; card share material; refusal below range; repeat and cross-brand real; subscriptions for tools | what "trusted commerce layer" earns |

## 3. Breakpoints (what changes if…)

| If… | Then… | Decision it forces |
|---|---|---|
| AOV falls | percentage revenue falls while payment, support and failed-delivery costs are per order | minimum fee; fee model with a fixed component (D-4) |
| Refusal rate rises | the largest variable cost rises and cash conversion slows; houses lose stock time | phone verification default (ADR-08), governorate restrictions (D-7), refusal cost allocation policy, card incentives |
| Seller-generated traffic dominates | revenue ≈ low fee; contribution near zero; company is seller SaaS | subscription/minimum fee; or invest in discovery to shift mix; doc 02 §11 "operate as seller SaaS first" |
| CAC rises | marketplace-generated orders cost more than 12–18 % earns | cap paid campaigns; lean on seller audiences and creators with performance pay |
| Shipping subsidy increases | contribution drops one-for-one; forbidden until measured (doc 03 §10) | do not; measure first |
| Repeat rate is low | LTV ≈ first-order contribution; CAC must be near zero | seller-audience-led growth; direct-return mechanics |
| Card share rises | PSP fee appears but refusal falls | measure net effect; decide pass-through |
| Platform books couriers | delivery cost and failed-delivery cost move onto the platform | only with A-2 costs recorded and the ledger live |

## 4. Fixed-cost coverage question

Break-even orders per month = fixed cost ÷ average contribution per completed order. With
contribution unknown (A-2), this cannot be computed; the pilot's first job is to record the
inputs, not to hit a number.

## 5. How the worksheet is kept (RECOMMENDATION)

One sheet owned by the finance owner, rows = inputs above, columns = evidence rank, value,
date, source; updated monthly (doc 06 §13); the `/ops/insights` contribution-inputs panel
mirrors the recorded/not-recorded status (FACT).
