# Marketplace economics

Conceptual model of how money moves, who bears each cost, and where the model is fragile.
No forecasts. Rates and costs are the founding pack's HYPOTHESES (doc 03) and market FACTS
cited in `docs/market/01` (Paymob card fee ~2.75 % + EGP 3 per transaction, accessed 18 Sep
2026; Jumia health & beauty commission 13 % incl. VAT with EGP 10 minimum, vendor hub
accessed 18 Sep 2026; COD first-attempt failure 20–35 % nationally per a logistics
provider's blog, June 2026). Every figure below must be replaced by supplier quotes and
pilot data (doc 03 §5).

## 1. The two order types (DOCUMENTED, doc 03 §2–3)

| | Seller-originated | Marketplace-generated |
|---|---|---|
| Source | storefront referral, direct repeat (and `unknown`, which takes the low rate by design — FACT) | organic search, paid campaign, creator/affiliate, email/CRM |
| Working rate | 3–5 % technology/operations fee, or subscription alternative | 12–18 % of completed net merchandise |
| Platform's cost to serve | the same payment, support and delivery risk | the same, plus acquisition cost |
| Doc 03 §5 illustration (EGP 700 AOV) | EGP 35 revenue → EGP 2 contribution before failed delivery and fixed costs | EGP 105 revenue → EGP 52 contribution |

**The asymmetry is the heart of the business and its most fragile joint.** It requires
attribution that houses accept as fair and that the platform can prove per order
(`docs/architecture/03` ADR-07). Today the mechanism is inert (FACT C4), so every order is
billed at the low rate: fair by accident, unprovable by design, and unable to earn the
marketplace stream.

## 2. Money flow (doc 03 §7) with cost bearers

```mermaid
flowchart LR
  C[Customer pays<br/>merchandise + delivery per house] -->|COD cash| K[Courier collects]
  C -->|card/wallet| P[PSP captures<br/>fee ~2.75%+EGP3 (cited)]
  K -->|remits| H1{who booked the courier?}
  H1 -->|house| H[House holds cash]
  H1 -->|platform| PL[Platform holds cash]
  P --> PL
  H -->|platform invoices commission| PL
  PL -->|payout net of commission, +shipping reimbursement if house shipped| H
  PL --> CO[Platform costs:<br/>payment fees · support · failed delivery share · refunds share · promo subsidy · creator cost · fraud]
```

FACT: today every house books its own courier and is reimbursed the customer's delivery
fee in the statement (settled principle, 4 Sep 2026); COD cash therefore sits with the
house, which means the platform's actual position is a **receivable** (invoice), not a
payable, until a platform courier account or PSP settlement exists (D-5 fork,
`docs/architecture/08` §4).

## 3. Cost lines and who bears them (DOCUMENTED doc 03 §4; bearer is RECOMMENDATION/OPEN)

| Cost | Driver | Bearer today | Bearer decision needed |
|---|---|---|---|
| Payment processing | card/wallet share × PSP fee | nobody (COD only) | pass-through, absorbed, or priced into rate (doc 03 §2 "at cost or transparently") — OPEN |
| COD collection fee | courier's COD charge | house (books courier) | if platform books: platform or pass-through — OPEN with A-2 |
| Delivery | courier tariff by governorate | customer pays fee; house books | platform subsidy forbidden until measured (doc 03 §10) |
| Failed delivery | refusal rate × courier attempt charge | house (today, implicitly) | allocate by reason code (doc 06 §7): customer/courier/seller/platform — OPEN policy |
| Returns and refunds | return rate × (refund + return shipping) | by cost bearer per case (FACT field) | policy per reason — OPEN with counsel |
| Support | tickets × time | platform (fixed staff) | A-3 recommendation: not costed per ticket unless outsourced (FACT recommendation) |
| Promotions | discount by bearer | zero today | house-funded vs platform-funded rules — Phase 2 |
| Creator/affiliate | commission share | none today | Phase 2 |
| Fraud | fake COD orders, review fraud | platform/house | risk flags, phone verification (ADR-08) |
| Fixed | hosting (~$80–120/mo per `docs/architecture/10`), founders' time, legal, content, seller acquisition | platform | budget (D-9) |

## 4. Contribution margin per completed order (doc 03 §4)

`platform revenue − payment cost − platform-funded delivery subsidy − refunds/failed-delivery
cost − variable support − promotional subsidy − affiliate/creator cost − variable fraud loss`

FACT: only revenue, platform-borne refunds, subsidy (zero) and discount (zero) are
recorded; payment cost, failed-delivery cost, creator cost and fraud loss are not
(`ANALYTICS_DEFINITIONS.md` §4). The screen shows inputs with status and refuses to show a
margin — correct, and it means **the company cannot yet state whether any order is
profitable**.

## 5. Structural observations (RECOMMENDATION)

1. **A pure 3–5 % fee on seller-originated orders may not cover payment and support**
   (doc 03 §5). Options the pack itself lists: pass payment fees through, subscription,
   minimum fee, lighter self-service tier. The data model should carry a `fee_model` and
   `minimum_fee` per house before pilot pricing (ADR-09), so D-4 is a row, not a rewrite.
2. **Failed delivery is the swing cost.** At a 20–35 % national COD first-attempt failure
   rate (cited), the refusal policy and phone verification decide viability more than the
   rate card does.
3. **Card payment is an economic lever, not just a feature**: prepaid orders fail far less
   often (cited 5–15 %), so the PSP fee may be cheaper than the refusal it prevents. Pilot
   must measure both.
4. **Who holds cash decides the payout model** (D-5). Until then the invoice arrangement
   matches reality.
5. **Sponsored visibility and subscriptions are later streams** (doc 03 §2) and must not be
   used to paper over a negative per-order margin.

## 6. Economic decisions the founders own (OPEN)

D-4 rates and fee model · D-5 settlement direction and whether funds may be held · payment
fee treatment · failed-delivery cost allocation policy · return cost policy · reserve and
payout cadence · pilot subsidies (photo shoots, onboarding help) recorded as CAC on the
supply side.
