# Trust framework

Trust is the product's proposition (doc 01 §5: "specialist marketplace that makes local
fragrance easy to compare and safer to buy"). This framework defines what trust is made of,
where each signal must appear, what evidence backs it, and what would break it.

## 1. The five trust pillars

| Pillar | Customer belief | Evidence behind it (must be true, not just said) | Where it shows | Breaks if |
|---|---|---|---|---|
| **Verified house** | "Someone checked this seller." | 8-control checklist (doc 06 §3), test order, contract, named escalation contact — enforced by database trigger (FACT) | tile, product, storefront, checkout, messages | a house goes live with a missing control; "verified" is shown without a definition |
| **Honest information** | "The description means what it says." | controlled vocabularies; performance bands with source; prohibited-claim scanner; moderation with coded reasons (FACT) | product page, compare | seller claim shown as platform fact; claims moderation invisible |
| **Real reviews** | "These people actually bought it." | delivered-order gate in domain, router and trigger (FACT); no seller deletion; incentives disclosed | tile summary, product, house | forgery via seller-known phone (M16, until verification); hidden negative reviews |
| **No hidden cost** | "What I saw is what I pay." | server-side pricing; per-house fee before payment; one arrival formula (FACT) | cart, checkout, product (target) | fee surprise; window mismatch |
| **Someone is accountable** | "If it goes wrong, they fix it." | one support route; return lifecycle; refund reconciled; platform answers (doc 06 standard) | every page footer, tracking, messages | "contact the seller"; silent orders |

## 2. Trust signal inventory (what appears where)

| Signal | Home | Tile | Product | House | Cart | Checkout | Tracking | Message |
|---|---|---|---|---|---|---|---|---|
| Verified house mark + one-line meaning | trust band | ✓ | ✓ | ✓ | per house | per shipment | per house | name |
| Rating (avg, count, "verified purchases") | most reviewed | ✓ | ✓ | ✓ | — | — | — | — |
| Performance band source | — | — | ✓ | — | — | — | — | — |
| Delivery fee + window to governorate | — | hint | ✓ | ✓ | ✓ | ✓ | ✓ dates | ✓ |
| Return eligibility (from listing) | — | — | ✓ | terms | — | ✓ | ✓ | — |
| COD explanation ("you pay the courier X") | trust band | — | — | — | ✓ | ✓ | ✓ | ✓ |
| Support route | footer | — | — | — | — | ✓ | ✓ | ✓ |
| Claims moderated | how it works | — | line | — | — | — | — | — |
| Sponsored label (when it exists) | ✓ | ✓ | — | — | — | — | — | — |

FACT today: only the product page's band sources, cart/checkout fees, and tracking states
exist; the rest is in the database and not on screen (`docs/frontend/01` §3).

## 3. Trust language (see `docs/brand/04-brand-voice.md` §5 for wording)

Rules: say what was checked, not "trusted"; say the source of a number; say who pays and
when; never a superlative; never "100 % authentic" without the evidence the claim rests on
(legal, `docs/legal/`).

## 4. Trust for sellers (the other side)

| Belief | Evidence | Breaks if |
|---|---|---|
| "They won't tax my own customers." | attribution shown per order with the touch that decided it; low rate on storefront/direct | attribution inert (today) so everything is `unknown` — fair by accident, unprovable by design |
| "The statement is right." | one settlement per sale; itemised; dispute deadline | double payout (C1 today) |
| "They won't undercut me." | seller sets price; no platform inventory in the category (Phase 3 gate) | — |
| "Reviews are fair." | verified only; abuse removed; criticism kept | — |
| "They answer the customer well." | support standards; house consulted | blame passed to the house publicly |

## 5. Trust debt to clear before pilot (from the audit)

Verified mark on screen · rating on tiles · fee on product page · notifications · phone
verification · payout ledger · refund reconciliation · cancel/refuse paths. Each maps to a
P0/P1 roadmap item in `docs/product/02-roadmap.md`.

## 6. What could destroy trust fastest (RISK, ranked)

1. A house paid twice and a house paid never, in the same month (C1 + C2).
2. A fake review cluster from a house (M16).
3. A COD refusal spiral in one governorate with no reason codes (doc 06 §7).
4. A safety complaint handled slowly (doc 06 §8 P0).
5. A "verified" house that turns out to be an unverified reseller (B-1).
