# Marketplace health

The metrics that say whether the two-sided system is alive, balanced and honest.
Reviewed monthly (doc 06 §13). Thresholds are ASSUMPTIONS to be replaced by pilot
baselines.

## 1. Liquidity and balance

| Metric | Definition | Healthy sign |
|---|---|---|
| Active houses | ≥1 completed order in 30 d | rising; no single house > 50 % of completed orders after month 3 |
| SKUs per family | published listings per scent family | ≥ 3 houses per family (compare is meaningful) |
| Orders per active house | completed ÷ active houses | rising; low variance |
| Multi-house basket share | orders with ≥2 sub-orders ÷ orders | > 0 and rising (cross-shopping) |
| Search zero-result rate | count-based | falling |

## 2. Source mix (the model's proof)

| Metric | Definition | Watch |
|---|---|---|
| Seller-originated share | storefront_referral + direct_repeat ÷ earned | high early is expected; if it stays > 80 % after Phase 2 campaigns, the marketplace stream is not real |
| Marketplace-generated share | organic + paid + creator + crm ÷ earned | rising with discovery investments |
| Unknown share | unknown ÷ earned | should fall to near zero once capture exists (today 100 %) |
| Effective take rate | revenue ÷ GMV | between the two rates, trending with mix |

## 3. Trust and quality

| Metric | Definition |
|---|---|
| Refusal rate by house and governorate | refused ÷ dispatched |
| Return rate by reason | returned ÷ delivered |
| Complaint rate | P1/P2 tickets ÷ delivered |
| Review coverage | reviews ÷ earned |
| Rating distribution per house | six dimensions |
| Moderation actions | listings sent back; reviews hidden (with reasons) |
| Houses under warning / suspended | counts |

## 4. Operations

| Metric | Definition |
|---|---|
| Confirmation and dispatch on-time rates | per house, per platform |
| Unanswered past SLA (open) | count now |
| Delivered-not-remitted > 7 d | COD cash outstanding |
| Exceptions open (daily report) | count by type |
| Support first response / resolution vs targets | doc 06 §9 |

## 5. Money

| Metric | Definition |
|---|---|
| GMV, held GMV, revenue, take rate | earned only |
| Contribution inputs with status | each term recorded / not (rule 3) |
| Payout accuracy and cash conversion | after ledger |
| Refund and failed-delivery cost by bearer | after A-2 |

## 6. Red flags (any one triggers a founder review)

One house > 50 % of orders after month 3 · unknown source share not falling after
capture ships · refusal rate above the national COD baseline in any governorate · a
statement dispute unresolved past its deadline · review coverage < 10 % of earned after
month 3 · a P0 ticket older than one hour.
