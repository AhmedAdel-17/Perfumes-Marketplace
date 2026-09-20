# KPI framework

Each KPI: definition (source of truth), owner, cadence, status (FACT: recorded today /
not recorded), and the decision it informs. Definitions defer to
`docs/ANALYTICS_DEFINITIONS.md` where one exists.

## Strategic

| KPI | Definition | Owner | Cadence | Status | Informs |
|---|---|---|---|---|---|
| Completed orders (North Star) | `earned` sub-orders | both founders | weekly | recorded | everything |
| GMV | Σ merchandise of earned sub-orders, excl. shipping | finance | weekly | recorded | never alone |
| Contribution margin / order | doc 03 §4 equation | finance | monthly | **not computable** until A-2 (payment, courier costs) | pricing, subsidies |
| Effective take rate | platform revenue ÷ GMV, earned only | finance | monthly | recorded | D-4 |
| Marketplace-attributed share | earned sub-orders with source ∈ {organic, paid, creator, crm} ÷ earned | business founder | monthly | **all `unknown` today** (C4) | the thesis |
| 90-day repeat | customers with a 2nd order within 90 d ÷ eligible | product | monthly cohort | recorded (definition) | retention |
| Cross-brand purchase rate | customers with orders from ≥2 houses ÷ customers with ≥2 orders | product | monthly | derivable | marketplace vs SaaS |
| Direct return rate | orders with `direct_repeat` or direct entry ÷ returning customers | product | monthly | needs attribution | disintermediation risk (doc 01 §9) |
| Active houses | houses with ≥1 completed order in 30 d | business founder | monthly | derivable | supply health |
| CAC | acquisition spend ÷ new customers completing a first order (doc 03 §4) | business founder | monthly | **not recorded** (no spend ledger) | growth |

## Financial

| KPI | Definition | Status |
|---|---|---|
| AOV | GMV ÷ orders with ≥1 earned sub-order | recorded |
| Held GMV | delivered, not yet earned | recorded |
| Payment cost | PSP fees + COD collection fees | not recorded (A-2) |
| Failed-delivery cost | courier charges on refused | count recorded, cost not |
| Refunds by bearer | `returns.refund` by cost bearer | recorded |
| Promotional subsidy | discounts by bearer | zero today |
| Payout accuracy | statements disputed ÷ issued | not recorded (no dispute object) |
| Cash conversion | days from delivery to remitted to paid out | derivable after ledger |

## Operational

| KPI | Definition | Status |
|---|---|---|
| Confirmation on time / median time | per `ANALYTICS_DEFINITIONS` §3 | recorded |
| Dispatch on time | same | recorded since 0020 |
| Delivery success (first attempt) | delivered ÷ dispatched, by governorate | partially (no attempts) |
| Refusal rate | refused ÷ dispatched by house, governorate, reason | state unreachable today |
| Cancellation rate (by actor, reason) | cancelled ÷ placed | unreachable today |
| Return rate (by reason) | returned ÷ delivered | sub-order never `returned` today |
| Support: first response, resolution vs doc 06 §9 | tickets | timestamps exist; targets not enforced |
| Exceptions open (daily report) | doc 06 §13 | not built |

## Trust

| KPI | Definition | Status |
|---|---|---|
| Reviews per delivered order | reviews ÷ earned | recorded |
| Review moderation actions | hides/restores with reasons | recorded |
| Complaint rate | P1/P2 tickets ÷ delivered | derivable |
| Verified houses with all 8 controls | by construction 100 % of live | recorded |
| Claims refusals at moderation | coded reasons | recorded |
| Suspicious review clusters flagged | manual | not built |

## Seller

| KPI | Definition | Status |
|---|---|---|
| Seller activation | first completed order within 14 d of live | derivable |
| Seller retention | active this month ∧ active 90 d ago | derivable |
| Seller-originated vs platform-generated orders per house | by commission source | needs attribution |
| Seller SLA table | per house | recorded |
| Statement disputes | per house | not recorded |
| Listings published / gaps | per house | recorded |

## What to stop measuring

Registrations (there are none by design); page views as a headline; GMV without
contribution; "verified reviews" as a percentage (all reviews are verified by construction).
