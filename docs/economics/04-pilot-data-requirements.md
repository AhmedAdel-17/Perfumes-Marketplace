# Pilot data requirements

What the pilot must record so that the unit economics worksheet can be filled with rank-1
evidence (doc 02 §3) and the doc 02 §10 scorecard can be scored. Each row: the data, where
it comes from, whether the system records it today (FACT), and what unblocks it.

| Data required | Proves / disproves | Recorded today | Unblock |
|---|---|---|---|
| Completed orders per house per week | activation, liquidity, North Star | yes (`earned`) | — |
| AOV, GMV, held GMV | doc 03 §5 assumption | yes | — |
| Source per sub-order with deciding touch | the fee model | **no** (all unknown) | ADR-07 capture |
| Effective take rate per house | acceptance of asymmetry | yes (definition) | attribution |
| Confirmation time, dispatch on time | SLA setting (doc 06 §5 "pilot SLA to be measured") | yes | — |
| Refusals with reason, attempts, governorate | COD economics | **no** (state unreachable) | P0-3 |
| Cancellations with actor and reason | supply quality | **no** | P0-3 |
| Returns with reason, cost bearer, refund | return policy cost | partial (returns yes; sub-order no) | P0-2 |
| Payment cost per order | contribution | **no** (A-2) | PSP contract; admin entry |
| Courier and failed-attempt charges | contribution | **no** (A-2) | courier contract; admin entry |
| Support tickets per order, first response, resolution | doc 06 §9 calibration | partial (timestamps) | targets in ops |
| Reviews per delivered order and timing | flywheel | yes (count); timing derivable | review request message |
| Multi-house baskets; cross-house repeat | marketplace proof (doc 02 §11) | derivable | volume |
| 90-day repeat, direct return | retention | definition yes; needs 90 days | time |
| Houses keeping bio link | routing commitment (rank 2) | manual check | ops log |
| Onboarding cost per house (hours, shoots) | supply CAC | **no** | onboarding log |
| Statement disputes | payout accuracy | **no** | ledger + dispute object |
| Seller interview outcomes (15) | fee acceptance, pain ranking | manual | doc 02 §6 script |
| Customer interview outcomes (30) | trust, information gaps | manual | doc 02 §7 script |

## Minimum pilot size for the scorecard (doc 02 §10, DOCUMENTED)

≥ 3 houses routing live traffic · ≥ 50 completed orders · 15 seller and 30 customer
interviews · confirmation and refusal tracked · contribution path visible · cross-brand
behaviour observed.

## What the pilot cannot prove (state it now)

Seasonality (one season only) · marketplace-generated share before any campaign runs ·
card economics before Paymob · nationwide refusal patterns beyond Cairo/Giza (D-7).

## Decision gates the data feeds (doc 02 §11)

Proceed to full MVP · revise wedge · operate as seller SaaS first · pause.
