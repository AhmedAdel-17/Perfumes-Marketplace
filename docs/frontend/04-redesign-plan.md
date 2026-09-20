# Frontend redesign plan

**Direction in one line:** *the house is the hero, the bottle is the proof, the platform is
the guarantee.* Keep the noir/brass identity, Amiri and the reference's restraint; replace
the brochure structure with a marketplace journey; give trust a visible shape on every
decision screen; give the operating tools their own dense system; make photography a
condition of listing.

This is a **product and UX** plan (RULE 8). Visual effects come last. Priorities in order:
clarity · trust · comparison · conversion · consistency · responsive behaviour · performance.

**Founder approval required before step 2** (CLAUDE.md §12: undesigned surfaces need a
decision, not an invention): the house-forward information architecture, the comparison
feature, the trust components, the Atelier tool system, and the photography requirement.

---

## 0. Decisions this plan needs (founder)

| # | Decision | Recommendation |
|---|---|---|
| FD-1 | Palette stays noir/brass with paper option | yes — the 7 Sep review already proposed and rejected alternatives |
| FD-2 | Photography is a **listing requirement**: minimum two photographs (bottle on dark, bottle in hand or on surface) at 1000×1250, art-directed by a one-page guide; the platform offers a paid shoot for pilot houses | yes — no design survives an illustrated placeholder |
| FD-3 | Build comparison at MVP (doc 04 §2 names it) | yes, three products, no designer-name references (legal) |
| FD-4 | Verified-house mark and rating appear on tiles | yes |
| FD-5 | Houses get a mark (logo) and a banner in the storefront; they supply both at onboarding | yes, with fallback monogram |
| FD-6 | Wishlist | defer to P4 (doc 04 lists it as "readiness") |
| FD-7 | The primary button loses its gradient | yes |

---

## 1. The journey, screen by screen

### Discovery — home `/`

- Masthead: wordmark · **الدور** (houses) · **العطور** (perfumes) · search · bag · theme.
- Opening: one house, one bottle, one photograph (curated, as today), with the **house
  mark** and "دار موثّقة" line, not a generic tagline.
- Then three entry points, each one row: *by family* (7 families with a note-icon), *by
  house* (`HouseCard` rail), *most reviewed this month*.
- A single trust band, quiet: verified houses · cash on delivery · returns per policy ·
  one support route. Four words each, hairline-separated.
- Then the grid, curated first, with the revised `ProductTile`.

### Search and filter — `/search`

- Desktop: filters in an end-side column (280 px), results start at the top; phone: a
  filter sheet with a count on the trigger. Filter chips with counts; "clear all"; sort in
  the results header.
- Results: revised tiles; a **compare** control on each tile adds to the tray (max 3); the
  tray is a bottom sheet on phone and an end-side drawer on desktop.
- Empty: "no perfume matches — try the family or the house" with two links.

### Product — `/p/[slug]`

- Above the fold (desktop 7/5, media start side): photograph gallery (ratio-locked,
  blur-up), house line with **mark + verified**, name, size · concentration,
  `RatingSummary`, price, **`TrustRow`** (delivery window and fee to a chosen governorate,
  COD, return eligibility from the listing), add to bag, add to compare.
- Then the notes pyramid, evolution curve, performance meters with source (unchanged).
- Then **the house panel**: mark, city, founded, story excerpt, rating, "ships itself in N
  days", link to storefront. Then reviews (six dimensions, verified). Then "from this
  house" and "similar family".
- Structured data (`Product`, `Offer`, `AggregateRating`) for SEO — storefronts are an
  acquisition surface.

### Compare — tray + `/compare?ids=`

- Table: photo, house, price, size, concentration, family, top/heart/base notes, longevity
  and projection bands **with source**, delivery window, return eligibility, rating. Add to
  bag per column. Shareable URL. No designer-name column, ever.

### Cart — `/cart`

- `ShipmentGroup` per house with fee and window; total; adjustments explained inline;
  desktop two columns with sticky summary (exists). Add the trust band under the summary.

### Checkout — `/checkout`

- Phone: three steps (contact → address → review) with a persistent total bar; desktop:
  form + sticky summary. Governorate via custom `Select`; area suggestions later.
- Review step states: what you pay the courier per shipment, when each arrives, how to
  cancel, support contact. One confirm.
- Card payment (P1) adds a method choice and a redirect state with a designed wait screen.

### Confirmation and tracking — `/order`

- Confirmation page carries a **link with a signed token** in the SMS (no retyping);
  lookup by reference + phone remains.
- `OrderTimeline` per house with dates; tracking number as a link when the courier has one;
  "what happens next" line per state; cancel action while pre-dispatch; review and return
  panels after delivery (exist).

### Review — on tracking

- Keep six dimensions; add the option to review only what was delivered per house; show
  the review on the product page within minutes (exists).

### Repeat — house storefront `/house/[slug]`

- Banner, mark, verified line, city, founded, rating, story, delivery terms, products,
  reviews across the house. This is the page a house links from its bio; it must look like
  *their* page inside *our* frame.

---

## 2. Operating tools — the Atelier system

### Seller portal

- Dashboard: four `Stat`s (awaiting answer, to ship, late, this week's sales), stock
  warnings, latest statement.
- Orders: `QueueRow` table sorted by active deadline; expand for address and items;
  `DecisionBar`; decline reasons in a sheet; dispatch inline with tracking field; filters
  by state.
- Listings: table with status pill, gaps count, photo count; form in two columns at desktop
  with a sticky "what is missing" panel; photo manager inside the form.
- Returns, payouts (ledger + statement + dispute deadline), staff (S-1 roles), profile
  (mark, banner, story, SLAs read-only).

### Ops console

- Orders: search by reference/phone/house; **customer timeline** (every sub-order, courier
  and support event on one page — doc 06 §6); actions: mark delivered/refused with reason
  and cost bearer, cancel on behalf, record remittance.
- Exceptions: the daily report as a screen.
- Payouts: draft → approve (second person) → paid, with the statement.
- Everything else as today, re-skinned to the Atelier ramp.

---

## 3. Sequence and acceptance

| Step | Scope | Acceptance |
|---|---|---|
| **R0 — foundations** (with P0 backend) | primitives package; `loading`/`error` per group; skeletons; button without gradient; custom select; Atelier tokens | audit clean both themes, six widths; visual baselines captured |
| **R1 — trust without redesign** | verified line + rating on tiles and product; `TrustRow`; house panel; policy lines at checkout; SMS link to tracking | no layout change; measured add-to-bag and checkout completion before/after in `/ops/insights` |
| **R2 — tools** | seller dashboard + queue table + decision bar; ops orders search + customer timeline + exceptions | house time-to-confirm and queue scroll height halved; ops can answer "where is order X" in one screen |
| **R3 — journey** | home IA, search layout, compare, product above-the-fold, checkout steps, tracking timeline, storefront | funnel stages in `/ops/insights` improve stage-over-stage; no p95 regression |
| **R4 — polish** | motion, photography guide, empty states, structured data, print styles | doctrine checklist per screen; "would Dior ship this screen?" review with the founder |

Each step ships behind no flag (they are additive) except R3's home IA, which ships as a
curation setting so the current home can be restored.

## 4. What this plan refuses

Toasts, badges ("NEW", "-20%"), countdown urgency, gradients, a second accent, stock
photography, a component kit, designer-name comparison, and any screen that has not been
measured at 390/768/1440 in both themes.
