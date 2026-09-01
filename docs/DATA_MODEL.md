# Data Model Specification

Derived from founding documents 01, 03, 04 and 06. Read alongside `CLAUDE.md`.

This is the shape the schema must support. It is not final SQL — design that in session 2
and have it reviewed. But **every entity and constraint below comes from a documented
requirement**, and dropping one drops a requirement.

---

## Core entities

### `sellers`

The marketplace is multi-vendor from the first line of code.

| Field group | Notes |
|---|---|
| Identity | legal name, trading name, owner name, contact, service area |
| Status | `applied` → `under_review` → `approved` → `live` → `suspended` |
| Verification | one row per control in the checklist below, each with evidence reference and status |
| Commercial | commission rates by source, subscription tier, payout schedule, reserve period |
| Operational | confirmation SLA, dispatch SLA, escalation contact, named data/privacy contact |
| Storefront | slug, bio, story, founding year, city, social links, banner/logo media |

**Verification checklist (doc 06 §3)** — each is a tracked control, not a boolean on the
seller row:

owner/business identity · payout ownership · product responsibility documents · labels and
artwork · claims evidence · return/defect route · service capacity (test order completed) ·
data/privacy contact.

A seller cannot reach `live` with an incomplete checklist. **There is no self-approval path.**

### `seller_staff`

Role-based access with limited permissions, separate from the seller owner. MVP
requirement, not a later addition.

### `products`

The catalogue schema is the defensible asset. Every group below is required.

| Group | Fields |
|---|---|
| Identity | `brand_id`, `seller_id`, name, SKU, `status` (draft/pending_moderation/published/suspended) |
| Commerce | price, promotional price, size, stock, fulfilment time |
| Product | concentration (enum), form (enum), gender positioning, scent family (enum), `notes_top[]`, `notes_middle[]`, `notes_base[]` |
| Use | season (multi), day/night, occasion, projection band, longevity band |
| Compliance | responsible seller, required warnings/label data, product evidence references |
| Media | primary image, gallery, alt text, **image ownership confirmation flag** |
| Policy | return eligibility, sealed/opened condition, defect route |

**Constraints:**
- No publish with a missing required field — enforce at the database level, not only in the UI.
- Controlled vocabularies as enums or lookup tables. Free text where an enum belongs is a bug.
- Performance bands carry a `source` field: `seller_provided` / `platform_test` / `review_aggregate`.
- Material changes to product, price, formulation, size or fulfilment create an **auditable revision** (doc 06 §4).

### `product_revisions`

Append-only. Required by doc 06 §4. Records what changed, by whom, when.

---

## Orders — the hard part

### `orders` (customer-facing)

One order, one customer, one payment, one tracking surface. Carries:

- `source` — **required**, one of: `storefront_referral`, `organic_search`, `paid_campaign`,
  `creator_affiliate`, `direct_repeat`, `email_crm`, `unknown`
- campaign / creator code / referring storefront
- payment method (`cod` | `card` | `wallet`), payment state
- address (governorate → city → area → street; no postal code)
- customer phone as primary identifier

### `sub_orders` (per seller)

A multi-seller cart produces one order and N sub-orders. Each has **its own state machine
and its own SLA clocks**.

```
placed → awaiting_seller → confirmed → dispatched → delivered
             ↓                 ↓            ↓
         rejected          cancelled   refused | returned
```

Each transition records: actor, timestamp, reason code where applicable.

**The reconciliation requirement (acceptance gate 4):** cancelled, refused, returned and
failed-payment states must reconcile correctly across merchandise value, shipping,
discounts, fees and payout. This is the hardest thing in the MVP. Test it first, not last.

### `order_line_items`

Product, quantity, unit price at time of order, commission rate applied at time of order.

**Rates are snapshotted onto the line item.** Never compute historical commission from the
current seller rate — rates change and statements must remain reproducible.

### `shipments`

Courier, tracking number, events, delivery attempts, proof of delivery. One per sub-order.

Track **refusal rate per seller and per area** — failed delivery is a real cost line
(doc 03 §4).

---

## Money

### `commission_rules`

Configurable by source and by seller. Never hardcoded.

| Source | Working rate |
|---|---|
| Seller-originated | 3–5% |
| Marketplace-generated | 12–18% |

Also holds attribution window and dispute-handling policy values.

### `payouts` and `payout_statements`

- Payout on a fixed schedule **after a defined reserve/return period**.
- Every payout has an **itemized statement** and a **dispute deadline**.
- Statement lines reconcile to merchandise, shipping, discounts, fees, adjustments.

> **Do not implement platform-held balances, split settlement, or COD settlement without
> confirmed legal and PSP review** (doc 03 §7). Model the data; flag the flow.

### `adjustments`

Every fee change and payout adjustment is auditable (acceptance gate 6).

---

## Trust

### `reviews`

Structured ratings on: scent, longevity, projection, value, packaging, **description
accuracy**.

**Only a `delivered` sub-order can produce a review** (acceptance gate 5). Enforce this as
a database constraint, not application logic.

Sellers have **no deletion rights** over reviews (doc 04 §3). Moderation is a platform
action, and moderation actions are logged.

Never sell review ranking. Sponsored placement is a separate, labelled field.

---

## Audit and compliance

### `audit_log`

Append-only. Admin actions, fee changes, payout adjustments, seller status changes, listing
moderation, review moderation. Actor, action, before/after, timestamp.

Required by acceptance gate 6. **Retrofitting an audit log is not feasible** — build it in
session 2.

### `consent_records`

PDPL 151/2020: consent and purpose records, retention rules, and a process for export and
delete requests. Minimal collection.

---

## Analytics

### `events`

Every event from `CLAUDE.md` §10, each carrying timestamp, anonymous/user ID (as lawful),
seller/brand/SKU, **order source**, campaign fields.

**Write the analytics definitions before implementing.** Contradictory dashboards are the
predictable failure mode here.

---

## The metric the schema exists to produce

```
Contribution margin per completed order =
    platform revenue
  − payment cost
  − platform-funded delivery subsidy
  − refunds / failed-delivery cost
  − variable support
  − promotional subsidy
  − affiliate / creator cost
  − variable fraud loss
```

Plus: AOV, GMV, effective take rate, CAC, **90-day repeat**, LTV (contribution margin
based — never revenue), seller payback.

> **Acceptance gate 8:** the business founder must see funnel, seller SLA and contribution
> inputs **without touching the database.** Design the schema so this reporting is possible;
> build the views in Phase 1.

Two retention metrics matter more than registrations (doc 01 §9, doc 03 §3):
**direct return** and **cross-brand purchase**. A registered user is not a
platform-acquired customer.
