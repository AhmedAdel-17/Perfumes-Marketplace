# Frontend UX / UI audit

**Evidence base.** The route and component source (18 Sep 2026), the browser suite's
assertions, the accessibility audit script's rules, the design references in
`/design-reference`, `DESIGN_DOCTRINE.md`, and the screenshots in `apps/web/.shots`
(4–8 Sep 2026; the 7 Sep design pass that added desktop columns and tables is partly
reflected in them). Where a screenshot predates a recorded fix, the code was read instead.

**The one-sentence diagnosis.** The shopfront has a *strong identity and a thin product*:
it looks like one maison's brochure, not a trusted marketplace of many houses, and the
operating tools wear the brochure's clothes. The founder's "visually unsatisfactory" is
correct, and the fix is not more gold; it is structure, trust, and photographs.

Severity: HIGH blocks conversion or operations · MEDIUM erodes trust or slows work · LOW polish.

---

## 1. UX

### 1.1 Information architecture and navigation

| Finding | Sev | Evidence |
|---|---|---|
| The site has no category structure. Entry points are: hero product, "all perfumes" grid, a houses directory, and a search page. Scent families, occasions, gender positioning and price bands exist as filters on `/search` only; nothing on the home page invites a *kind* of search. | HIGH | `app/page.tsx`, `Filters.tsx` |
| Masthead carries three links (marketplace, search, bag). No houses link in the masthead; houses are in the footer and a hero line. For a marketplace whose thesis is *houses*, the house is not in the primary navigation. | HIGH | `SiteHeader.tsx` |
| No "how it works" / who-we-are surface in the journey. The `/about` CMS page exists behind the footer. A first-time buyer never learns that houses are vetted, that COD exists, or how returns work until checkout or the footer. | HIGH | route map |
| Search and browse are two different pages with different layouts; the grid on home is uncurated beyond "featured first". | MEDIUM | `/search` vs `/` |
| Seller and ops consoles have navigation (since 7 Sep) but no breadcrumb or context header; the `/ops/insights` period and `/ops/audit` filter are in the URL (good). | LOW | `OpsNav.tsx`, `SellerNav.tsx` |

### 1.2 Discovery, search, filtering, comparison

| Finding | Sev | Evidence |
|---|---|---|
| Search works well technically (Arabic variants, Latin house names, URL-carried filters). The **filter wall sits above the results** at desktop width, so results start below the fold on a 1440 screen. | MEDIUM | `search-desktop.png` |
| Filters are plain rectangles with no count, no selected-state beyond outline; price is two bare inputs. No "clear all". | MEDIUM | `Filters.tsx` |
| **No comparison.** Doc 04 §2 says "compare"; doc 01 §2 says the customer friction is "weak comparison". The catalogue's structured fields (concentration, family, notes, bands with source) are exactly what a comparison table needs and they are shown one product at a time. | HIGH | no `comparison_view` |
| Tiles show brand (Latin small caps), name, size · family, price. No rating, no house verification mark, no delivery promise, no "from Cairo". A tile answers "what" and never "why trust". | HIGH | `ProductTile.tsx` |
| Every product is the same illustrated flacon in a different tint until a house uploads a photograph. Three seeded products, three colours, one bottle. It reads as a template. | HIGH | `Flacon.tsx`, seed |

### 1.3 Product understanding and trust

| Finding | Sev | Evidence |
|---|---|---|
| Notes pyramid, evolution curve and performance bands with **source disclosure** are the best thing on the site and genuinely differentiating. | KEEP | `NotesPyramid`, `PerformanceMeter` |
| The house block is one line: name + "prepares and ships itself, arrives in 2–3 days". No verification mark, no city, no founded year, no rating, no "ships to your governorate", no return eligibility (which is a listing field). | HIGH | `p/[slug]/page.tsx` |
| Delivery fee (55 EGP per house) is first seen in the cart. Doc 04 §2 wants shipping visible before payment (met) but a buyer deciding on a 290 EGP bottle should see "+55 delivery" on the product page. | MEDIUM | `shipping.ts`, PDP |
| Reviews: six dimensions, masked byline, verified-only — strong. But the summary is below the fold and absent from tiles and search. | MEDIUM | `ProductReviews.tsx` |
| Buy block: price, "available now", add to bag. Availability language is fine; no quantity, no size variants (one SKU per listing — acceptable). | LOW | `BuyBlock.tsx` |
| Prohibited-claim scanner protects the platform; nothing tells the *buyer* that claims are moderated. Trust that is invisible is not trust. | MEDIUM | — |

### 1.4 Cart and checkout

| Finding | Sev | Evidence |
|---|---|---|
| Cart groups by house with a delivery line each and a total — correct and honest. Photo, name, house, stepper, remove. Sticky summary at desktop since 7 Sep. | KEEP | `CartView.tsx` |
| Checkout is one long form: contact, address (7 fields), payment (COD only), then the per-house summary and total at the bottom. On the 4 Sep screenshot the total is 1,500 px below the first field; the 7 Sep log says the summary became sticky on desktop. Phone width still scrolls past everything to find the total. | MEDIUM | `04-checkout-desktop.png`, log |
| Address uses a **native `<select>`** for governorate — the doctrine forbids default platform pickers. | LOW | `Field.tsx` |
| No order review step; the confirm button is on the form. For COD this is acceptable; for card it will not be. | LOW | `CheckoutForm.tsx` |
| Trust at the moment of decision: one grey line "by confirming you agree to the terms and return policy". No delivery window per house beside the price (it is in the summary lines), no "pay the courier in cash" explanation above the fold, no support contact. | MEDIUM | screenshot |
| Errors: every missing field reported at once, Arabic, inline — good. Arabic-Indic digits accepted — good. | KEEP | QA #3 |

### 1.5 Order tracking and aftercare

| Finding | Sev | Evidence |
|---|---|---|
| Confirmation page shows reference, total, houses, ETA; tracking is a lookup by reference + phone. A customer must retype both later; there is no SMS carrying a link (no notifications exist). | HIGH | `OrderLookup.tsx`, H2 |
| Tracking shows per-house state as a pill and tracking number; no timeline, no "what happens next", no estimated date, no courier link. | MEDIUM | `OrderLookup.tsx` |
| Review and return panels appear on the tracking page after delivery — correct placement; the form refuses until six ratings are given (strict but honest). | KEEP | e2e |
| No cancel action anywhere (C6). | HIGH | — |

### 1.6 Seller discovery, house pages

| Finding | Sev | Evidence |
|---|---|---|
| House page: story, city, products — good bones. No banner image, no logo mark, no founded year, no verification line, no rating aggregate, no delivery/return terms. Houses directory is a list with counts. | MEDIUM | `house/[slug]/page.tsx` |
| Brand independence (doc 01 §6) is honoured — the house is named everywhere — but visually every house is the same: same illustrated bottle, same layout, no house colour or mark. The marketplace flattens brands *visually* while preserving them *textually*. | HIGH | tiles, Flacon |

### 1.7 Seller portal (operating tool)

| Finding | Sev | Evidence |
|---|---|---|
| Queue cards carry countdown, reference, items, customer, address, total, confirm/decline. Sorted by active deadline. The information is right. | KEEP | `OrderQueue.tsx` |
| The portal uses the shopfront's 52 px display headline and its spacing; a queue is a **work surface** and it is styled as a brochure. The 7 Sep log admits "the operating tools have never had a type scale of their own". | HIGH | `10-seller-queue.png`, log |
| No dashboard: a house lands on the queue with no counts (awaiting, to ship, late), no today's money, no stock alerts. | MEDIUM | `/seller/page.tsx` |
| Listing form: 24 fields in 6 groups with a gap counter — good pattern; long single column; no autosave indicator; photo manager is a separate step that new sellers may miss (the form says why). | LOW | `ListingForm.tsx` |
| No notifications, no staff, no performance indicators (doc 06 §11). | HIGH | — |

### 1.8 Operations console

| Finding | Sev | Evidence |
|---|---|---|
| Thirteen screens, one nav, tables since 7 Sep; audit and insights are genuinely usable. | KEEP | — |
| Work queue shows only "needs delivery confirmation / needs remittance" — deliberately narrow; there is no all-orders view, no order search by reference/phone, no customer timeline (doc 06 §6 "support sees one customer timeline and every seller/courier event"). | HIGH | `WorkQueue.tsx` |
| No daily exception view, no SLA board. | MEDIUM | — |

### 1.9 States

| State | Current |
|---|---|
| Loading | none designed; client islands show "loading" text or nothing; no `loading.tsx`, no skeletons (doctrine §2 forbids spinners and asks for skeletons — currently there is neither) |
| Empty | designed for cart, search, queues, reviews |
| Error | inline form errors; unknown errors show a generic Arabic sentence; no `error.tsx` boundaries; no request id shown |
| Offline | none |
| End of list | not applicable yet (no pagination) |

---

## 2. UI

| Area | Finding | Sev |
|---|---|---|
| Visual hierarchy | Shopfront: strong on hero, product title, price. Search: filters outweigh results. Tools: headline outweighs work. | MEDIUM |
| Typography | Amiri/Bodoni/Plex set correctly; Arabic leading right; Bodoni labels letterspaced; **Bodoni 9.5–10.5 px labels on noir are at the legibility floor** on real phones (allowed by tokens only for labels; they are everywhere). | MEDIUM |
| Spacing | Generous on shopfront (correct per doctrine); the same generosity makes the queue a 6,500 px scroll for a handful of orders (7 Sep log). | MEDIUM |
| Layout | 390 / 768 / 1440 all measured; product 7/5 split; grids 2→3→4. | KEEP |
| Colour | Noir/bone/brass with brass for price and accent rule; paper theme with the same roles; contrast asserted in tests. One accent honoured. | KEEP |
| Cards | Hairline-bordered `l1` panels; consistent. Tiles have no hover/press state beyond link underline. | LOW |
| Buttons | Primary is a **brass gradient** rectangle; doctrine's instant-death list names "rounded pill buttons with gradients" — this is not rounded, but the gradient is the single most "generated" element on screen. Secondary is an outlined rectangle. Press state exists (opacity). | MEDIUM |
| Forms | Shared `Field`; labels above; inline errors; native select; no input adornments; no masks for phone. | LOW |
| Tables | Consoles: tables with named regions, keyboard-reachable scroll boxes; no sticky headers, no column sorting, no density control. | LOW |
| Modals | none used (decisions are inline) — good for tools, but decline reasons render as four inline buttons with no confirmation. | LOW |
| Icons | 40 bespoke icons at 1.3 stroke; consistent. | KEEP |
| Mobile | audited at six widths; 44 pt targets; sticky masthead with scroll padding. | KEEP |
| Consistency | high — tokens and drift tests make it so. | KEEP |
| Motion | `Reveal` rise-in at 700 ms; theme crossfade; no bounce; reduced motion honoured. | KEEP |
| Imagery | the illustrated flacon is beautifully drawn and it is the problem: one object, three tints, every house. | HIGH |

---

## 3. Marketplace trust — how the UI communicates it today

| Trust signal | Where it should be | Where it is |
|---|---|---|
| Verified house | tile, product, house page, checkout | nowhere (all live houses *are* vetted; the UI never says so) |
| Reviews | tile, search, product top, house page | product page only, below the fold |
| Product information | product page | strong, with source disclosure |
| Seller information | product page, house page | one line / a story paragraph |
| Fulfilment | product page, cart, checkout, tracking | cart and checkout only (per house days + fee); product page has days, not fee |
| Pricing | everywhere | clear, EGP label, "prices include tax" in the footer only |
| Shipping | product page | cart onward |
| Policies (returns, sealed/opened, COD) | product page (per listing eligibility), checkout | CMS pages via footer; listing eligibility not shown to buyers |
| Transparency (who ships, who you pay) | checkout | one sentence under COD |
| Support | every page | footer link |

The founding promise — "clear choices, verified sellers, honest reviews and one reliable
buying relationship" (doc 01 §3) — is implemented in the database and largely invisible on
the screen.

---

## 4. What must not change

The token system and its tests; the role-based two-theme model; Arabic-first typography
and plural handling; RTL and 44 pt discipline with the audit script; server-side pricing
and URL-carried state; the notes pyramid and performance bands; the honesty rules
(unrecorded ≠ zero, one arrival formula). The redesign is built on these, not around them.
