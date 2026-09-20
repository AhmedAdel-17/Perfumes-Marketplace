# Customer journey blueprint

The journey is designed for the personas in `docs/product-strategy/02-personas.md`,
carries the trust framework in `03-trust-framework.md`, and is served by the front-stage /
back-stage blueprint in `02-customer-service-blueprint.md`. Metrics use the definitions in
`docs/analytics/03-customer-funnel.md`. "Today" = FACT from the repository on 18 Sep 2026.

## 1. Visual journey map

```mermaid
journey
  title First-time customer, COD, one house (target state)
  section Arrive
    Sees a house's post or creator video: 3: Customer
    Taps the house's DIYAR link (attribution captured): 4: Customer, Platform
    Lands on the house storefront, sees "verified house": 4: Customer
  section Decide
    Browses perfumes, opens one: 4: Customer
    Reads notes, bands with source, reviews, delivery fee to their governorate: 5: Customer
    Compares with two others: 4: Customer
    Adds to bag, sees one shipment and its fee: 4: Customer
  section Buy
    Enters phone, gets a code (policy), address, reviews COD terms: 3: Customer, Platform
    Confirms; receives SMS with reference and tracking link: 5: Customer, Platform
  section Wait
    House confirms within SLA; customer told: 4: House, Platform
    Dispatched with tracking; customer told: 4: House, Courier, Platform
    Courier arrives; customer pays cash and accepts: 3: Customer, Courier
  section Return to us
    Asked to review a week later; rates six dimensions: 4: Customer
    Gets a "you might also like from other houses" message (policy): 3: Platform
    Comes back directly to the house page or the marketplace: 5: Customer
```

## 2. Stage-by-stage definition

Columns: goal · question · action · platform responsibility · information required · trust
signal · friction · failure scenarios · metric · opportunity.

### Acquisition
- **Goal:** find a perfume worth the money. **Question:** is this real, and is it good?
- **Action:** taps a house link, a creator code, a search result, or a shared page.
- **Platform:** capture the touch lawfully (channel, ref, time — no personal data) for
  attribution (ADR-07); serve the storefront fast on mobile data.
- **Information:** house name, verified status, what it sells, price band.
- **Trust signal:** the house's own mark inside DIYAR's frame; "verified" with a one-line
  meaning.
- **Friction:** slow page, English-first UI, an unfamiliar platform name.
- **Failure:** attribution lost (today: always lost — C4); link goes to a generic home
  instead of the house.
- **Metric:** `storefront_view`, `campaign_click`, `source_attributed` share.
- **Opportunity:** the house's bio link *is* the acquisition channel (doc 02 §1).

### Landing
- **Goal:** orient in seconds. **Question:** what is this place and why should I stay?
- **Platform:** one lit object, three entry points (family, house, most reviewed), trust
  band; house storefront when arriving via a house.
- **Trust signal:** verified houses · COD · returns · one support route, four words each.
- **Friction:** brochure feel with no way in (today: FACT, `docs/frontend/01`).
- **Failure:** bounce without a second page view.
- **Metric:** landing → discovery rate; bounce.

### Discovery
- **Goal:** narrow to a few candidates. **Question:** what kinds exist, which houses?
- **Platform:** families, occasions, houses as browsable dimensions; curated grid;
  photographs not placeholders.
- **Trust signal:** rating and verified mark on every tile.
- **Friction:** identical illustrated bottles (today); no category entry points.
- **Metric:** `product_view` per visitor; houses viewed per session.

### Search
- **Goal:** find by name, house, note or family in Arabic as typed. **Question:** does it
  understand me?
- **Platform:** Arabic variant folding (FACT, strong); Latin house names; suggestions.
- **Failure:** zero results with no way out (today: handled with links, FACT).
- **Metric:** `search` → `product_view` conversion; zero-result rate (count only — no
  query text stored, A-1).

### Filtering
- **Goal:** cut by what matters (family, concentration, price, house, availability,
  occasion). **Platform:** filters with counts, in the URL, results first on desktop.
- **Metric:** `filter_apply` → `product_view`.

### Product evaluation
- **Goal:** decide if this bottle is worth it. **Questions:** what does it smell like, how
  long does it last, who says so, who made it, when will it arrive, what if I don't like it?
- **Platform:** notes pyramid; bands with source; reviews across six dimensions; house
  panel; delivery fee and window to a chosen governorate; return eligibility from the
  listing; COD explanation.
- **Trust signal:** source disclosure ("seller-provided" vs "review aggregate"); verified
  purchase reviews; verified house.
- **Friction:** fee unknown until the bag (today); house info one line (today).
- **Failure:** claim moderation invisible; band source misread as a guarantee.
- **Metric:** `product_view` → `cart_add`.

### Comparison
- **Goal:** choose between two or three. **Platform:** side-by-side of structured fields
  and delivery; no designer-name column (legal).
- **Metric:** `comparison_view` → `cart_add` (event exists in doc 04 §6; not fired today).

### Cart
- **Goal:** see the whole cost. **Platform:** per-house shipments with fee and window;
  adjustments explained (price/stock changed); total.
- **Trust signal:** no fee appears later that was not here.
- **Failure:** multi-house basket surprises the customer with two fees (mitigated by
  showing it here; doc 06 §6).
- **Metric:** `cart_add` → `checkout_start`.

### Checkout
- **Goal:** finish in under two minutes on a phone. **Platform:** phone (verified by code
  when policy says), address without postcode, Arabic-Indic digits accepted, three steps on
  phone, review step with COD terms and support contact.
- **Failure:** duplicate order on retry (today: no idempotency — H1); unverified phone
  enabling fake orders (H5).
- **Metric:** `checkout_start` → `order_place`; field error rate.

### Payment / COD
- **Goal:** pay the way I trust. **Platform:** COD default; card/wallet when licensed;
  clear "you pay the courier X for shipment Y".
- **Failure:** card failure must cancel and release stock (target); refusal at the door
  (`04` failed-delivery journey).
- **Metric:** `payment_select` (only once two methods exist); failed payment rate.

### Order confirmation
- **Goal:** know it worked and what happens next. **Platform:** reference, per-house
  windows, SMS with signed tracking link, how to cancel before dispatch.
- **Failure:** silence (today: no messages — H2).
- **Metric:** confirmation SMS delivery rate.

### Fulfilment
- **Goal:** not have to chase. **Platform:** house confirms within SLA (alerts before
  breach), customer told at confirm and dispatch with tracking number.
- **Failure:** house never answers → platform cancels with reason `seller_unresponsive`
  (state exists; path unbuilt) and tells the customer.
- **Metric:** confirmation time; on-time dispatch.

### Delivery
- **Goal:** receive the right bottle intact and pay what was quoted. **Platform:** courier
  events; proof of delivery; refusal reason codes; cost allocation (doc 06 §7).
- **Failure:** refusal, unreachable, wrong address — see `04`.
- **Metric:** delivery success; refusal rate by house and governorate.

### Review
- **Goal:** say what it was like. **Platform:** ask ~7 days after delivery by message;
  six dimensions; verified only; incentives disclosed.
- **Failure:** house forges a review using the customer's phone (M16; closed by phone
  verification).
- **Metric:** reviews per delivered order.

### Repeat purchase
- **Goal:** come back easily. **Platform:** house page as destination; order history once
  accounts exist (D-2); reorder link in the delivered message.
- **Metric:** 90-day repeat; direct return (doc 01 §9).

### Cross-brand purchase
- **Goal:** try another house with the same confidence. **Platform:** "from other houses"
  rails; comparison; family browsing; one bag across houses.
- **Metric:** cross-brand purchase rate — the metric that proves the marketplace is more
  than storefront SaaS (doc 02 §11).

### Referral
- **Goal:** tell a friend credibly. **Platform:** shareable house and perfume pages; a
  referral mechanic in Phase 2 (doc 04 §3 readiness).
- **Metric:** `referral_complete` (Phase 2).

## 3. Journey variants

### 3.1 First-time customer
As above. Two decisions dominate: **phone verification at first order** (ADR-08, OPEN) and
**whether the landing is the house or the marketplace** (it is whichever link they tapped;
both must carry trust signals).

### 3.2 Returning customer
Arrives directly (bookmark, message link, house page). Attribution: `direct_repeat` for a
house they bought from before (low rate, FACT in resolver). Wants: reorder, track, review,
see new products from "their" houses. Needs an account only when the phone alone stops
being enough (D-2). Metric: direct return, 90-day repeat.

### 3.3 Dissatisfied customer
Triggers: scent preference, performance below claim, damage, wrong item, late delivery.
Route: tracking page → return request (policy windows by reason: 14 days change of mind
where eligible, 30 days fault — FACT in domain) or support ticket (priority by category —
FACT). Platform owns the answer; "the seller made the mistake" is never the reply (doc 06
standard). Outcomes reconcile in the ledger (`docs/architecture/08`). Metric: complaint
rate, resolution time against doc 06 §9 targets.

### 3.4 Failed delivery
Courier cannot deliver or customer refuses. Reason code required (doc 06 §7). Platform
records refusal, allocates cost (seller/platform/customer/courier), releases stock,
notifies the customer with next steps (re-attempt or cancel), flags repeat refusals for
manual review (no automated blocklist). Market context (FACT, `docs/market/01`): COD
first-attempt failure 20–35 % nationwide — this journey is not an edge case. Metric:
refusal rate by house and governorate; cost per refusal once A-2 gives the figure.

### 3.5 Refund / return
Request → house agrees/declines within its window → in transit → received → platform
refunds (amount, cost bearer) → ledger reversal → customer told. Today the sub-order and
ledger never learn (FACT C2). COD refund mechanics (cash back to a customer who paid the
courier) are an OPEN DECISION tied to D-5 and the PSP.

## 4. Cross-cutting journey rules

- Every message the customer receives names the house *and* DIYAR; the relationship is one.
- Every state change the customer can see has a "what happens next" sentence.
- No urgency tactics anywhere (doctrine law VII).
- Arabic first; digits per the documented rule; phone is the identity.
