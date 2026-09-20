# Product strategy

**Status labels used throughout the blueprint:** FACT (verified in repository or cited
source) · DOCUMENTED REQUIREMENT (founding docs 01–06) · HYPOTHESIS (founding-pack working
assumption) · RECOMMENDATION (this blueprint) · ASSUMPTION (unverified, ours) · OPEN
DECISION · RISK.

Working name: **DIYAR / ديار** — selected 1 Sep 2026, trademark screening not performed
(FACT, `OPEN_DECISIONS.md` D-1). Treated as provisional everywhere in this blueprint.

---

## 1. Product vision (DOCUMENTED REQUIREMENT, doc 01 §3)

To become Egypt's most trusted destination and commercial infrastructure for local fragrance.

**In product terms (RECOMMENDATION):** one place where an Egyptian buyer can compare local
perfumes on the same honest terms, and one system through which a serious local house can
sell, ship, get paid and learn — without building any of it alone.

## 2. Product mission (DOCUMENTED REQUIREMENT, doc 01 §3)

Help customers confidently discover Egyptian perfumes while helping serious local brands
sell, operate and grow professionally.

## 3. Positioning (DOCUMENTED REQUIREMENT, doc 01 §5; RECOMMENDATION for the expansion)

> For Egyptian perfume buyers overwhelmed by fragmented options, DIYAR is the specialist
> marketplace that makes local fragrance easy to compare and safer to buy. Unlike generic
> marketplaces or isolated brand pages, it combines standardised scent information,
> verified reviews and category-specific seller standards.

Two positioning corollaries the founding pack implies and this blueprint makes explicit:

- **Against generic marketplaces** (noon, Jumia, Amazon.eg — FACT that all three list
  fragrance categories, see `docs/market/`): DIYAR wins on *category depth* (notes,
  performance bands, sources), *house identity* (a house is a destination, not a SKU) and
  *seller economics that respect who brought the customer* (doc 03). It does not try to win
  on catalogue breadth, imported designer brands or logistics scale.
- **Against a house's own Instagram/WhatsApp** (the supply wedge, doc 01 §1): DIYAR wins on
  *operations* (orders, tracking, payouts, statements), *trust transfer* (verified, reviewed,
  one support route) and *incremental demand* — never by taking the house's own customers
  at the marketplace rate (doc 03 core model).

"Amazon for local perfumes" remains an internal explanation, not a customer proposition
(doc 01 §5).

## 4. Product promise (DOCUMENTED REQUIREMENT, doc 01 §3)

| To customers | To sellers |
|---|---|
| Clear choices, verified sellers, honest reviews and one reliable buying relationship. | A professional storefront, order infrastructure, data and incremental demand without building the technology alone. |

**Promise discipline (RECOMMENDATION):** each promise word maps to something the product
must visibly do. "Verified" must appear on screen with what it means; "honest reviews"
requires verified-purchase-only and no seller deletion (built, FACT); "one relationship"
requires a single support route and a single tracking surface (built, FACT). A promise the
screen does not show is a promise the company has not made (see
`docs/frontend/01-ux-audit.md` §3).

## 5. Core customer problems (DOCUMENTED REQUIREMENT, doc 01 §2)

1. Discovery is fragmented across social pages, shops and individual sites → high search
   effort, weak comparison.
2. Descriptions, sizes, concentration, performance and policies are inconsistent → low
   confidence, avoidable disappointment.
3. Quality, reviews and seller reliability are hard to verify → trust attaches to
   individual pages, not to the category.
4. (Implied by doc 06 §7–8 and the COD evidence in `docs/market/`) Buying on delivery from
   an unknown page is risky for both sides → refusals, disputes, no recourse.

## 6. Core seller problems (DOCUMENTED REQUIREMENT, doc 01 §2)

1. Small sellers: orders arrive through DMs → errors, slow follow-up, no clean sales data.
2. Growing brands: acquisition and delivery handled independently → duplicated cost,
   limited reach.
3. (Implied by doc 03 §2 and doc 06 §11) No neutral proof of reliability → a good house
   cannot be told apart from a bad one by a first-time buyer.
4. (ASSUMPTION, to validate in seller interviews, doc 02 §6) Payments, COD reconciliation
   and courier management consume owner time that should go to product and content.

## 7. Product principles

Preserved from doc 01 §6, with the product consequence stated (RECOMMENDATION column):

| Principle (DOCUMENTED) | Product consequence |
|---|---|
| Trust before scale | Fewer, vetted houses. Verification visible. No self-approval, ever. |
| Evidence before code | Every feature carries the doc 04 §9 change-control fields; pilot data decides. |
| Incremental value | Attribution is a first-class product object; the seller sees *why* a rate applied. |
| Transparent economics | Shipping per house, fees, sponsorship, delivery windows shown before payment. |
| One customer relationship | One account (phone), one support route, one tracking surface, one review identity. |
| Brand independence | The house is a destination page with its own mark, story, terms and reviews. |
| Compliance by design | Claims moderation, consent, return policy, retention are launch scope. |

Added principles (RECOMMENDATION, derived from the QA and audit record):

| Principle | Why |
|---|---|
| **One definition per number** | Two formulas for one promise already shipped once (QA #14). Delivery windows, "completed", commission and ratings each have one source. |
| **Unrecorded is not zero** | A dashboard that shows a missing cost as 0 flatters the business into its next bad decision (`ANALYTICS_DEFINITIONS.md` rule 3). |
| **The category is the product** | Scent data quality (notes, bands, sources, vocabularies) is the asset; the code is not (doc 01 §8). |
| **Quiet luxury, loud honesty** | Restraint in visuals (doctrine); explicitness in money, policy and status. |

## 8. Jobs-to-be-done — see `03-jobs-to-be-done.md`
## 9–11. Personas — see `02-personas.md`
## 12. Value propositions — see `04-value-proposition.md`
## 13. Boundaries and non-goals — see `05-product-boundaries.md`

## 14. MVP definition

**DOCUMENTED (doc 04 §2, §3, §8):** selected sellers route real orders through branded
storefronts; buyers discover, complete and track purchases; eight acceptance gates.

**Current state (FACT, `docs/product/01-mvp-readiness.md`):** three gates met, three
partial, two not met; the money engine has six correctness defects; nothing runs
unattended.

**RECOMMENDATION — the MVP is redefined by outcome, not by screens:**

> The MVP is done when **ten completed, attributed, correctly settled orders across at
> least three houses** have passed through the system with **no manual database work**,
> every customer received status messages, every house saw a statement it agreed with, and
> at least one order each was cancelled, refused and returned and reconciled correctly.

This is the doc 04 §7 Phase 0 exit ("real seller-routed completed orders") run *on* the
built product, which is the honest way to reconcile the "evidence before code" principle
with the fact that Phase 1 was built first (OPEN DECISION X1 in
`docs/architecture/00-ingestion/CURRENT_ASSUMPTIONS.md`).

## 15. Post-MVP product evolution (aligned to doc 04 §7)

| Phase | Product becomes | Enters when (evidence) |
|---|---|---|
| 1 → stable pilot | the operating system for 5–15 houses; COD; manual courier; SMS | MVP definition above met |
| 2 Growth | better search and comparison; house storefronts as acquisition pages; card payment; Bosta; campaigns with attribution; creator codes; wishlist; referral readiness | repeat/direct traffic and positive contribution (doc 04) |
| 3 Fulfilment | selected inventory, combined shipping, faster delivery | order density proves economics (doc 03 §10) |
| 4 App/experience | native apps, sampling, showroom, subscription | clear retention or operational case (doc 04) |

## 16. Explicit non-goals — see `05-product-boundaries.md` §3
