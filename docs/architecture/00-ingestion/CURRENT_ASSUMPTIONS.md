# Current assumptions — what the code assumes that nobody has verified

Each line is either an **ASSUMPTION baked into code**, an **ASSUMPTION in the founding
pack** the code inherited, or a **conflict** between the two. None of these may be treated
as fact. Where a founder decision exists in `docs/OPEN_DECISIONS.md` it is cited.

## Baked into code

| # | Assumption | Where | Why it matters |
|---|---|---|---|
| A1 | Flat delivery fee of **55 EGP per house**, courier transit 1–2 days | `packages/api/src/shipping.ts` | Every price the customer sees. Bosta's tariff is by governorate and weight. |
| A2 | Commission defaults: storefront/direct/unknown 5%, organic 15%, paid 18%, creator 15%, CRM 12% | `policies/commission.ts` `DEFAULT_RATES` | D-4 says "hypothesis only". The constant is the only source today. |
| A3 | Attribution windows 30/7/7/7 days | `policies/attribution.ts` | Doc 03 §3: must be in the pricing agreement. Never disputed because nothing is attributed. |
| A4 | Every order is `unknown` source at the low rate | `orders.place` passes `touches: []` | The platform currently **cannot** earn the marketplace rate. |
| A5 | Reserve 7 days, dispute window 7 days, confirmation SLA 24h, dispatch SLA 48h per house | `sellers` defaults | Doc 06 §5: "pilot SLA to be measured". |
| A6 | Every house books its own courier (`delivery_fulfilled_by = 'seller'`) and is reimbursed the customer's delivery fee | settled 4 Sep 2026 | Correct only while there is no platform courier account. |
| A7 | COD cash is remitted **to the platform** by the courier, then paid out | settlement model, `recordRemittance` | If the house books the courier, the courier remits to the **house**. The platform then needs to **invoice** commission, not pay a net. Depends on D-5. Flagged in the 14 Sep review; unresolved. |
| A8 | A phone number typed at checkout is the customer, unverified | `customers.findOrCreateByPhone` | COD fraud and refusal risk (doc 06 §7). Guest policy D-2 is open. |
| A9 | Product stock is advisory | cart caps quantity at stock; nothing decrements it | Two customers can buy the last bottle. |
| A10 | Returns move money only in an audit JSON | `returns.resolve` | The ledger never learns about a refund. |
| A11 | Only the house **owner's** phone can sign in | `seller/actions.ts` joins on `sellers.contact_phone` | Staff accounts exist in schema but cannot be used. |
| A12 | Arabic only; digits: Western for data, Arabic-Indic for editorial counts | i18n | D-3 open. Layer exists for a second locale. |
| A13 | Browsing events keep no personal data, cookie 180 days, purge at 180 days | 0023, A-1 | Awaiting counsel. |
| A14 | Payment method is COD only at launch | `z.literal('cod')` | Doc 04 §3 wants "COD and licensed electronic payment as commercially available". |
| A15 | Cairo/Giza service area, but the address form accepts all 27 governorates and quotes the same fee | `GOVERNORATES` | D-7. Nothing refuses an order to Aswan. |

## Inherited from the founding pack (labelled there as hypotheses)

- Sellers will route Instagram/WhatsApp orders through a third-party storefront (doc 02 §2).
- 3–5% / 12–18% take rates are acceptable to sellers (doc 03 §2).
- AOV ≈ EGP 700 (illustrative only, doc 03 §5).
- COD dominates; refusal economics decide viability (doc 02 §1, doc 06 §7).
- No proven specialist competitor exists (doc 02 §1 — "do not market 'first in Egypt'").

## Conflicts found during ingestion

| # | Founding pack | Code / engineering docs | Recommendation |
|---|---|---|---|
| X1 | Phase 0 (manual pilot, real seller-routed orders) exits **before** Phase 1 build (doc 04 §7; doc 01 "evidence before code") | Phase 1 was built first; `OPEN_DECISIONS.md` still shows "Proceeding before Phase 0 exit: ☐ not recorded" | Record the decision. Use the built product as the Phase 0 instrument (a "manual pilot" run on the software with ops doing courier/remittance by hand). |
| X2 | Native apps are Phase 4, "explicitly deferred" (doc 04 §10) | `WORK_PLAN.md` §11–13 is actively building the mobile boundary; `TECH_STACK.md` lists two Expo apps; `CLAUDE.md` §13 permits Redux for mobile | **Stop mobile work** (11.3 onwards) until doc 04 §7's Phase 2 exit evidence exists. Keep 11.1/11.2 since they also serve the web. |
| X3 | Every analytics event carries order source and campaign (doc 04 §6) | A-1 deliberately strips source/campaign/customer from browsing events | Keep A-1 for browsing events (privacy wins); source lives on the sub-order. Update doc 04 §6 wording or record the deviation. |
| X4 | Seller-originated fee: 3–5% **or subscription alternative**; illustrative economics show a 5% order barely covers payment + support (doc 03 §5) | Only percentage rates modelled; no minimum fee, no subscription, no pass-through of payment cost | Model `minimum_fee_piastres` and a `fee_model` per seller now (data only); pricing is D-4. |
| X5 | Seller "must not delete or privately suppress reviews" (doc 06 §10) | Correct — hide/restore is platform-only and audited | none |
| X6 | "Every payout includes an itemised statement and a dispute deadline" (doc 03 §7) | Present, but the statement can list the same sub-order in two payouts | Fix (C1). |
| X7 | Cancelled, refused, returned and failed-payment must reconcile (acceptance gate 4) | `WORK_PLAN.md` marks gate 4 ✅; code has no path to `cancelled`/`refused`/`returned` | Gate 4 is **not met**. Correct the plan. |
| X8 | Seller staff with limited permissions is an MVP requirement (doc 04 §1) | schema roles ≠ decided roles; staff cannot sign in | Implement S-1 before pilot with more than one person per house. |
| X9 | Support: one route, platform owns the customer relationship (doc 01 §6) | Correct — houses see tickets, only platform answers | none; S-1's support-role question remains open |
| X10 | `TECH_STACK.md`: Supabase Auth | own OTP + HMAC cookies | Keep own; write ADR. |

## Things this audit could not verify from the repository

- Whether any real seller, customer or order has ever passed through the system (none is
  recorded anywhere; the seed is the only data).
- Egyptian SMS deliverability, Paymob and Bosta contract terms, and whether the entity may
  hold funds (D-5).
- The legal position on opened-perfume returns, designer-name references, EDA cosmetics
  notification and PDPL consent — all "pending counsel".
- Founder equity, budget, runway, entity (D-8..D-10). Doc 05 is blank.
