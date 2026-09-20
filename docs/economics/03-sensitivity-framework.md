# Sensitivity framework

Which inputs the outcome is most sensitive to, why, what evidence resolves each, and the
policy lever attached. Ordered by expected leverage (RECOMMENDATION; no magnitudes claimed).

| # | Driver | Why it dominates | Evidence that resolves it | Lever | Owner |
|---|---|---|---|---|---|
| 1 | **Order source mix** (seller vs marketplace) | 3–4× revenue difference per order (doc 03 §2) | attribution capture live for one full month across ≥3 houses | discovery investment; campaign attribution; windows | business founder |
| 2 | **Refusal / failed-delivery rate** | largest variable cost (doc 03 §4); national COD baseline 20–35 % (cited) | shipments with reason codes for ≥100 dispatches | phone verification policy; area policy; card incentives; cost allocation | ops |
| 3 | **Fee model on seller-originated orders** | doc 03 §5: EGP 2 contribution illustrative | seller interviews on minimum fee/subscription acceptance (15 interviews) | D-4 | both founders |
| 4 | **Payment method mix** | PSP fee vs refusal avoided | card share and refusal by method after Paymob | pass-through policy | finance |
| 5 | **AOV** | per-order costs are fixed-ish | first 50 completed orders | minimum fee; bundles later | product |
| 6 | **Orders per house** | fixed-cost coverage; seller retention | 90 days of pilot | qualification (demand-first houses) | business founder |
| 7 | **Repeat and cross-brand** | LTV and marketplace proof | 90-day cohorts | trust layer; house pages; review timing | product |
| 8 | **Return rate and cost policy** | refunds and return shipping | returns with reasons | eligibility per listing; counsel on windows | ops + counsel |
| 9 | **Support load** | fixed if salaried; variable if outsourced | tickets per order | A-3 | ops |
| 10 | **Supply-side CAC** (shoots, onboarding hours) | often ignored; real cash | onboarding cost log per house | pilot offer design | business founder |

## Interaction effects to watch

- Card payment raises PSP cost **and** lowers refusal: net effect unknown until measured.
- Phone verification lowers fraud/refusal **and** adds checkout friction: measure
  `checkout_start → order_place` before and after (ADR-08 policy is configurable for this
  reason).
- Marketplace campaigns raise the high-rate share **and** CAC: contribution per attributed
  order, not GMV, decides.
- Platform-booked couriers improve tracking **and** move failed-delivery cost onto the
  platform: only with A-2 recorded.

## What the sensitivity framework is not

It is not a model with outputs. Until the inputs in `02` have rank-1 or rank-4 evidence,
any output is an invented number, which the founding pack forbids (doc 03 §5 "not a
forecast").
