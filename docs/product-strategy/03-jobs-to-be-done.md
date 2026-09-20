# Jobs-to-be-done

Format: *When [situation], I want to [motivation], so I can [outcome].* Each job names the
persona (`02-personas.md`), the founding-pack source, what the product does about it today
(FACT) and what it should do (RECOMMENDATION). Jobs are grouped by the journey stages used
in `docs/customer-experience/01-customer-journey.md` and `docs/seller-experience/01`.

## 1. Customer jobs

| # | Job | Persona | Source | Today (FACT) | Target |
|---|---|---|---|---|---|
| CJ1 | When I see a local perfume on social media, I want to check it against similar ones from other houses, so I don't buy on one page's word | C1, C3 | doc 01 §2 "weak comparison" | search + product page; no compare | comparison of up to three with notes, bands and sources |
| CJ2 | When I read a perfume's description, I want to know whether the performance claim is the seller's or verified, so I can trust it | C3 | doc 04 §4 performance source | source disclosed on every band | keep; show review-aggregate bands once enough reviews exist |
| CJ3 | When I'm about to pay, I want the full cost per shipment and when each arrives, so nothing surprises me at the door | all | doc 04 §2, doc 06 §6 | per-house fee and window before payment | add per-governorate tariff; show fee on the product page |
| CJ4 | When I pay cash at the door, I want to know who I'm paying and what I can refuse, so I feel safe | C1, C2 | doc 06 §7 | one sentence under COD | explicit COD explanation, refusal consequences, support contact |
| CJ5 | When my order is on its way, I want to know where it is without retyping anything, so I don't have to chase | all | doc 04 §3 tracking/notifications | lookup by reference + phone; no messages | SMS/WhatsApp with signed tracking link at each state |
| CJ6 | When the bottle disappoints or arrives damaged, I want a clear route to return or complain that does not depend on the seller's mood | C2 | doc 06 §8 | return request with policy windows; support tickets | keep; make eligibility visible before purchase |
| CJ7 | When I've worn it a week, I want to say what it was really like in the terms I care about, so others can trust it | C3 | doc 04 §3 structured ratings | six dimensions, verified only | ask at the right moment (delivered + 7 days), by message |
| CJ8 | When I liked a house, I want to find it again and see what else it makes, so I can come back directly | C3 | doc 01 §9 "direct return" | house page; no account, no wishlist | house page as bookmarkable destination; wishlist in Phase 2 |
| CJ9 | When a friend asks where I got it, I want to share a page that looks trustworthy, so they buy too | C1 | doc 04 §3 referral readiness | shareable URLs | referral mechanics Phase 2 |

## 2. Seller jobs

| # | Job | Persona | Source | Today (FACT) | Target |
|---|---|---|---|---|---|
| SJ1 | When a customer DMs me, I want to send them one link where they can order properly, so I stop copying addresses by hand | S1 | doc 01 §2 | storefront `/house/{slug}` exists; no referral capture | short link with attribution (`docs/architecture/03` ADR-07) |
| SJ2 | When an order arrives, I want to be told immediately and see exactly what to pack and where, so I confirm within my promise | S1, S2 | doc 06 §5 SLA | queue with countdown; no notification | SMS/WhatsApp on new order and before breach |
| SJ3 | When I ship, I want a tracking number recorded once and the customer told, so I stop answering "where is it" | S1 | doc 04 §3 shipment integration or manual fallback | manual tracking number; no customer message | courier booking; automatic messages |
| SJ4 | When the month ends, I want a statement that lists every order, fee and reimbursement, so I can check it against my bank | all | doc 03 §7 | statement exists; **can double-count** (C1) | ledger-based statement, dispute deadline, one settlement per sale |
| SJ5 | When I bring my own customer, I want to pay the low fee and see the platform prove it, so I don't feel taxed on my own work | S1, S2 | doc 03 core model | every order is `unknown` at 5 % (attribution inert) | attribution shown per order with the touch that decided it |
| SJ6 | When I add a product, I want to know what's missing before I'm rejected, so I publish first time | all | doc 06 §4 | gap counter and claims scanner | keep; photography guide inside the form |
| SJ7 | When a customer complains, I want to answer through one place and not lose the relationship, so my reputation is protected | S1 | doc 01 §6 one support route | platform answers; house sees | keep; S-1 support role decision open |
| SJ8 | When I'm doing well, I want to know it and be shown to more people, so growth compounds | S2 | doc 06 §11 indicators | none in portal | performance indicators; merchandising eligibility |

## 3. Platform / operations jobs

| # | Job | Persona | Source | Today (FACT) | Target |
|---|---|---|---|---|---|
| PJ1 | When a house applies, I want a checklist that cannot be skipped, so trust is real | ops | doc 06 §2–3 | 8 controls, go-live trigger | evidence uploads to a private bucket |
| PJ2 | When an order stalls, I want to see it before the customer does, so I intervene | ops | doc 06 §13 daily | no alerts, no exception report | SLA jobs, exception report |
| PJ3 | When cash comes back from a courier, I want it matched to orders automatically, so payouts are right | finance | doc 06 §12 | manual remittance entry, no matching | courier statement import and reconciliation |
| PJ4 | When I release money, I want a second person to approve and a record to exist, so no one can act alone | finance/admin | doc 04 §8 gate 6, doc 05 §9 | audit exists; no second approver, no paid state | two-person payout approval |
| PJ5 | When I look at the business, I want funnel, SLA and margin inputs in one screen with honest gaps, so decisions are evidence-based | founder | doc 04 §8 gate 8 | `/ops/insights` | keep; add ledger money and exceptions |
| PJ6 | When a review looks fake, I want an audit trail and an investigation path, so trust is defended | ops | doc 06 §10 | hide/restore with note | cluster detection later (`docs/ai/`) |

## 4. Jobs deliberately not served now

Warehouse fulfilment for houses (Phase 3), sampling (Phase 4), designer-name comparison
(legal), multi-brand resellers (open), English (D-3).
