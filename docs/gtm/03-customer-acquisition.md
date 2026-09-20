# Customer acquisition

Principle: **borrowed demand first, earned demand second, bought demand last** — and never
bought demand for a thin shelf. Doc 01 §9 names borrowed demand as a strategic risk; the
answer is to measure direct return and cross-brand purchase, not to avoid borrowing.

## 1. Channels by phase

| Phase | Channel | Mechanism | Attribution source | Cost |
|---|---|---|---|---|
| Pilot | House audiences (Instagram/WhatsApp/TikTok — FACT that local houses sell there) | bio link, story mentions, DM replies with the link | `storefront_referral` (low rate) | none |
| Pilot | Editorial and SEO | house stories, perfume pages with structured data; "how to read a perfume" | `organic_search` | founder time |
| Pilot | Word of mouth | shareable pages; review requests | direct / unknown | none |
| Phase 2 | Creators with codes | disclosed codes, performance pay | `creator_affiliate` | variable |
| Phase 2 | Platform paid social | campaigns with UTM, attribution windows | `paid_campaign` | CAC measured |
| Phase 2 | CRM (SMS/WhatsApp opt-in) | review request, "new from houses you bought", reorder | `email_crm` | per message |
| Phase 2 | Referral | customer-to-customer with a documented benefit | `referral_complete` | small |
| Phase 3+ | Partnerships (gifting, events, retail corners) | ASSUMPTION | — | — |

## 2. Content strategy

Category education (families, concentration, notes, how to test), house stories, honest
"what the bands mean" pieces, seasonal editorial — all in the CMS block set (FACT), all
Arabic first, none with discount language. Content is how category authority (doc 01 §5)
becomes visible before the catalogue is large.

## 3. SEO opportunities (FACT-based)

- House and perfume pages are server-rendered with metadata (FACT); add `Product`/`Offer`/
  `AggregateRating` structured data (planned).
- Arabic search variants are handled on site (FACT); mirror the same normalisation in page
  titles.
- Local-brand list articles exist in Egyptian media (FACT: Egyptian Streets, ELLE Egypt,
  Egypt Today, This is Cairo, Cairo360 — `docs/market/01`) — a source of house mapping and
  of link opportunities, not of copied content.

## 4. Creator strategy (Phase 2; rules first)

Codes recorded as touches; disclosure on any review or content (doc 06 §10); performance
pay only; no creator may post a review as a customer; counsel on advertising disclosure
(`docs/legal/03`).

## 5. What we will not do

Discount-led acquisition ("30–75 % OFF" is the importers' language — FACT) · buying
followers or reviews · paid campaigns before ≥3 houses per family and reviews exist ·
retargeting with third-party pixels (A-1) · claiming "first in Egypt" (doc 02 §1).

## 6. Measurement

Every arrival is tagged; CAC is computed only from recorded spend; the funnel in
`docs/analytics/03` distinguishes house-link arrivals from marketplace arrivals; 90-day
repeat and cross-brand decide whether borrowed demand became owned.
