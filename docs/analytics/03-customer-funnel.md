# Customer funnel

Two halves, as `ANALYTICS_DEFINITIONS.md` §2 defines them: before the order (anonymous
events, visitors vs events) and after the order (transitions). Stage conversion is always
stage ÷ the same cohort's earlier stage.

## Pre-order (anonymous, first-party; FACT: recorded since 16 Sep 2026)

| Stage | Event | Diagnostic cuts | Target signal (pilot; ASSUMPTION until baseline) |
|---|---|---|---|
| Arrived | `landing_view` | by entry (house storefront vs home vs search engine) | — |
| Looked at a house | `storefront_view` | by house | houses viewed per visitor > 1 (cross-shopping intent) |
| Searched / narrowed | `search`, `filter_apply` | zero-result count | zero results < 10 % of searches |
| Looked at a perfume | `product_view` | by house, family | product views per visitor |
| Compared | `comparison_view` (to add) | — | compare → cart_add uplift |
| Put in bag | `cart_add` | by house; multi-house baskets | cart_add / product_view |
| Started checkout | `checkout_start` | — | checkout_start / cart_add |
| Placed | `order_place` (transition) | first-time vs returning | order_place / checkout_start ≥ 60 % (ASSUMPTION) |

Not recorded by decision (A-1): search text, customer id, source/campaign on events.
`payment_select` only once two methods exist.

## Post-order (identified by phone; transitions are the source of truth)

| Stage | Definition | Exits (always with reason) |
|---|---|---|
| Placed | sub-orders created | — |
| Confirmed | transition → confirmed | rejected (reason), cancelled (actor, reason) |
| Dispatched | → dispatched | cancelled |
| Delivered | → delivered | refused (reason) |
| Completed | classified `earned` | returned (reason) |
| Reviewed | review submitted | — |
| Repeated (90 d) | second order | — |
| Cross-shopped | second house | — |

## Journey-level questions the funnel must answer

1. Where do first-time customers drop: evaluation (trust), cart (fees), or checkout
   (form)? — informs R1 vs R3 in the redesign plan.
2. Do house-link arrivals convert differently from marketplace arrivals? — informs
   attribution windows and the seller pitch.
3. Does comparison raise conversion? — justifies FD-3.
4. How many baskets span houses? — the marketplace proof.
5. What share of delivered orders are reviewed, and how soon? — timing of the review
   message.

## Anti-patterns

Counting events as people; comparing this week's placed with last week's delivered;
showing conversion for stages the system cannot observe (cancel/refuse today).
