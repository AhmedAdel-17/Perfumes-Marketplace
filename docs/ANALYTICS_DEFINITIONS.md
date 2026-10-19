# Analytics definitions

**Status:** written 15 September 2026, before any dashboard exists — as doc 04 §6 and
CLAUDE.md §10 require. **Owner of the definitions:** the business founder (doc 04 §9 —
"market policy and commercial acceptance"). **Owner of the computation:** engineering.

> Doc 04 §6: *"Analytics definitions must be written before implementation to prevent
> contradictory dashboards."* This file is that. A figure on the owner's screen that
> is not defined here is a bug.

---

## 1. Four rules every figure obeys

1. **One definition of "completed", and it is the payout's.** A sub-order is
   *completed* when `SettlementService` classifies it `earned`: delivered, the cash is
   in hand (COD remitted / card captured), and the house's reserve period has passed.
   The owner's dashboard calls the same classifier the payout run calls. If the two
   ever disagree, a house is paid for one number while the owner reads another — the
   exact contradiction §6 exists to prevent.
2. **Never GMV alone** (doc 03 §10). Every revenue figure is shown beside contribution
   inputs and cash conversion.
3. **Unmeasured is not zero.** An input the system does not record is displayed as
   *not recorded*, never as `0`. A contribution margin that silently omits payment cost
   is a number that flatters the business into its next bad decision.
4. **The period is Cairo's day.** Periods are bounded by `Africa/Cairo` midnight, on
   `orders.placed_at` unless a definition says otherwise. A UTC day splits an Egyptian
   evening — the busiest perfume-buying hours — across two dates.

**Units.** Seller metrics count *sub-orders* (one per house per basket). Customer metrics
count *orders*. Money is integer piastres throughout and is formatted only at the edge.

---

## 2. The funnel

### 2a. After the order — measurable today

Computed from `sub_orders` and the append-only `sub_order_transitions`.

| Stage | Definition | Source |
|---|---|---|
| Placed | sub-orders created in the period | `sub_orders.created_at` |
| Confirmed | …that reached `confirmed` | transition `→ confirmed` |
| Dispatched | …that reached `dispatched` | transition `→ dispatched` |
| Delivered | …that reached `delivered` | transition `→ delivered` |
| Completed | …classified `earned` (rule 1) | `SettlementService` |

Exits are counted separately and **always with their coded reason** — the reason is the
point (doc 06 §7): `rejected` (by `REJECTION_REASONS`), `cancelled`, `refused` (by
`REFUSAL_REASONS`), `returned` (by `RETURN_REASONS`).

Stage conversion is `stage ÷ placed` for the same cohort of placed sub-orders — never a
ratio of two different periods' counts.

### 2b. Before the order — recorded since 16 September 2026 (A-1)

| Stage | Event | Fired by |
|---|---|---|
| Arrived | `landing_view` | the home page |
| Looked at a house | `storefront_view` | `/house/[slug]`, carrying the house |
| Searched | `search` | `/search` with words typed |
| Narrowed | `filter_apply` | `/search` with filters and no words |
| Looked at a perfume | `product_view` | `/p/[slug]`, carrying the perfume |
| Opened its reveal | `reveal_open` | the reveal control on `/p/[slug]`, carrying the perfume (since 19 Oct 2026, 0033) |
| Put one in the bag | `cart_add` | the add-to-bag control |
| Started checkout | `checkout_start` | `/checkout` |

**`reveal_open` is not a stage every visitor passes.** The reveal (Le Dévoilement — the
bottle lifted out of its photograph) exists only on perfumes the content team has made a
relief for, and opening it is a choice. It sits in the table where a visitor meets it, but
its count is read as *uptake*, not as a step of the funnel. **Its success measure, set
before it shipped (founder, 19 Oct 2026):** of the visitors who opened a perfume's reveal,
the share who then put *that* perfume in the bag — against the same share for visitors who
looked at a perfume that HAS a reveal without opening it. Visitors, not events, on both
sides; the same perfumes on both sides, so a comparison with perfumes that have no reveal
cannot flatter it.

**Counted two ways, and the difference matters.** *Events* counts rows; *visitors* counts
distinct anonymous ids. One person refreshing a perfume page twenty times is one visitor
who viewed it, and a conversion rate built on events would report that person as twenty
people who did not buy.

**What is deliberately NOT recorded**, enforced by the database's own policy
(migration 0023), not by convention:

- **No search text.** A `search` is counted; the words are not. The search box is exactly
  where somebody types a name, a phone number or an address.
- **No customer id**, not even for a signed-in customer. The trail is never joined to a
  person.
- **No source or campaign.** Attribution is recorded per sub-order at order time, and that
  is the record commission is computed from; a second copy here would drift from the money.
- **No `payment_select`** — there is one payment method, so the event would record a choice
  nobody makes. No `wishlist_add` or `comparison_view`: neither feature exists.

**Identity.** A first-party cookie holding 24 random hex characters, `httpOnly`, 180 days.
It is not an account and means nothing on any other site.

**Retention.** Raw events are deleted after 180 days by `app.purge_analytics_events`.
Nothing schedules that yet — DEBT_REGISTER #5 — and the two 180-day figures are the
proposal in OPEN_DECISIONS A-1, **awaiting counsel**, not a settled rule.

---

## 3. Seller SLA

Per house, per period. Denominators include only sub-orders **whose deadline has passed
or that were acted on** — an order with eleven hours left is neither on time nor late.

| Metric | Definition |
|---|---|
| Answered on time | answered (confirmed **or declined**) at or before `confirm_due_at` ÷ sub-orders answered, or unanswered past `confirm_due_at` |
| Unanswered past deadline | state `awaiting_seller`/`placed` and `now > confirm_due_at` |
| Median time to answer | time of the confirm-or-decline transition − `created_at`, answered sub-orders |
| Dispatch on-time rate | `dispatched_at ≤ dispatch_due_at` ÷ sub-orders dispatched or past `dispatch_due_at` |
| Dispatch breaches open | state `confirmed` and `now > dispatch_due_at` |
| Rejection rate | `rejected` ÷ placed, **by reason** |
| Refusal rate | `refused` ÷ dispatched, **by house and by governorate** (CLAUDE.md §16 — failed delivery is a real cost line) |
| Return rate | `returned` ÷ delivered, by reason |

**Why "answered", not "confirmed" (corrected 15 September, before implementation).**
The first draft of this table counted only confirmations as on time, so a house that
declined an out-of-stock order within ten minutes was scored as late. The confirmation
SLA is a promise to *answer* the customer quickly; counting a prompt decline against it
would teach houses to sit on orders they cannot fill. Declines are not hidden — they are
the rejection rate, by reason, beside it.

**The dispatch clock begins with migration 0020.** Until then `dispatch_due_at` was never
written. Orders confirmed before 0020 were backfilled from the house's setting on the day
of the migration; no house had changed its SLA, so those deadlines are true, but they are
reconstructions and the screen says so for that range.

A breached order is the same thing the house sees go red on its own queue: past the
deadline and not yet acted on. One rule, both screens.

---

## 4. Contribution inputs

Doc 03 §4: *contribution margin per completed order = platform revenue − payment cost −
platform-funded delivery subsidy − refunds/failed-delivery cost − variable support −
promotional subsidy − affiliate/creator cost − variable fraud loss.*

Each term, and where it comes from **today**:

| Term | Status | Source / reason |
|---|---|---|
| Platform revenue | **recorded** | Commission on `earned` lines, from the snapshotted `commission_bps` — never today's rate |
| Payment cost | **not recorded** | No PSP fee or COD collection fee is stored. Depends on D-5 |
| Platform-funded delivery subsidy | **recorded — zero by arrangement** | Every house is `delivery_fulfilled_by = 'seller'`; the house bears and receives delivery. A true zero, labelled as such |
| Refunds borne by the platform | **recorded** | `returns.refund_piastres` where `cost_bearer = 'platform'` |
| Failed-delivery cost | **count recorded, cost not** | `refused` sub-orders are counted; the courier charge for a failed attempt is not stored |
| Variable support | **count recorded, cost not** | `support_tickets` per period; no cost per ticket exists. Shown as a count, never converted to money by an assumed rate |
| Promotional subsidy | **recorded** | `orders.discount_piastres` (zero today — no promotions exist) |
| Affiliate / creator cost | **not recorded** | `orders.creator_code` exists; nothing pays creators |
| Variable fraud loss | **not recorded** | No fraud-loss event exists |

### Headline figures (doc 03 §4 table)

| Figure | Definition here |
|---|---|
| GMV | Σ merchandise of `earned` sub-orders. Excludes shipping |
| AOV | GMV ÷ orders with at least one `earned` sub-order |
| Effective take rate | Platform revenue ÷ GMV, earned lines only (the same rule `SettlementService.effectiveRateBps` uses) |
| Held GMV | Merchandise delivered but not yet `earned` — cash not remitted or inside reserve. Shown beside GMV so a good week of deliveries is not mistaken for money in hand |
| Source mix | GMV and order count by `commission_source` — the per-sub-order verdict that billing uses, not the order-level `orders.source` |
| 90-day repeat | Customers with a second order within 90 days of their first ÷ customers whose first order is ≥ 90 days old |

**Contribution margin itself is not shown** until at least payment cost is recorded. A
margin computed from four of eight terms is not a conservative estimate of the margin; it
is a different number wearing the margin's name.

---

## 5. What the owner's screen shows, and refuses to

**Where:** `/ops/insights`, in the operations console. **Who:** platform staff with the
`admin` role only. Platform revenue and take rate are the business's own margin; an
operator working the delivery queue needs neither, and least privilege (CLAUDE.md §8)
is not suspended for internal staff. An operator who opens it is told why in a sentence.

**Periods:** today, 7, 30 or 90 Cairo days. A fixed list rather than a date picker, so
any figure an owner quotes can be reproduced by someone else from the same screen.

**Shows:** the post-order funnel with exits by reason; the SLA table per house; every
contribution input with its status; GMV beside held GMV and take rate; source mix.

**Refuses:** a single "revenue" headline without its context; any input displayed as zero
when it is unrecorded; a contribution margin with missing terms; a pre-order funnel built
on guesses.

---

## 6. Decisions this document hands back

| # | Decision | Owner | Blocks |
|---|---|---|---|
| A-1 | Lawful basis and retention for browsing events (guest analytics) | Counsel + business founder | §2b, the pre-order funnel |
| A-2 | How payment and courier costs enter the system — PSP/courier reports, or a monthly figure entered by an admin | Business founder (with D-5) | A contribution margin |
| A-3 | Whether a support ticket is costed, and at what rate | Business founder | Variable support as money |
