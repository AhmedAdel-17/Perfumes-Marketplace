# Component inventory

Status: **built** (FACT, exists in `apps/web`), **partial**, **new**. UI ownership per
`01-design-system-strategy.md` §6. States: interactive = rest/press/focus/disabled/loading;
list = loading/empty/error/offline/end.

## Shared primitives

| Component | Status | Notes |
|---|---|---|
| Text (display, h1–h4, body, label, meta, num) | partial (classes exist; no primitive) | Arabic leading; Latin isolation |
| Button (primary, secondary, quiet, destructive) | partial (`PrimaryButton`) | remove gradient (FD-7); loading = hairline progress |
| Icon button | partial | required `aria-label` |
| Text field, phone field, number field, textarea | built (`Field`) | digit normalisation by `inputMode` |
| Select (custom listbox) | new | replaces native `<select>` |
| Choice cards / radio / checkbox | partial | decline reasons today are buttons |
| File drop (photos) | built (`PhotoManager`) | presigned upload; verification |
| Surface (ground, raised, panel, plate) | built (roles) | |
| Divider | built | |
| Status pill (outlined, word) | built (`statusPill`) | |
| Skeleton (text, block, tile, row) | new | must match final layout |
| Drawer / sheet | new | compare tray, filters on phone, reasons |
| Table (sticky header, sort, density, keyboard scroll) | partial (tables in consoles) | |
| Data list | new | |
| Stat | new | |
| Timeline (RTL fill from right) | partial (pyramid spine pattern) | tracking, returns, audit |
| Countdown | built (queue) | breach state |
| Money | partial (`formatPrice`) | tabular, EGP label |
| Meter (fills from right, source line) | built (`PerformanceMeter`) | |
| Mark (house mark / monogram fallback) | new | |
| Photo (ratio-locked, blur-up) | partial (`ProductPhoto`) | blur-up to add |
| Empty / error / loading state blocks | partial | designed empties exist; no error boundaries |

## Customer UI (Maison)

| Component | Status |
|---|---|
| Hero (one lit object, house line) | built |
| Product tile (photo 4:5, house line + mark, name, family · size, rating, price, delivery hint) | partial (no rating/mark/hint) |
| House card | new |
| Trust band | new |
| Filters (chips with counts, clear all, sheet on phone) | partial |
| Compare tray + compare table | new |
| Product page: gallery, buy block, trust row, notes pyramid, evolution curve, meters, house panel, reviews, rails | partial (no gallery/trust row/house panel) |
| Rating summary | partial (`Ratings`) |
| Reviews list + six-dimension form | built |
| Shipment group (cart/checkout/tracking) | partial |
| Checkout steps (phone) | new |
| Order timeline | new |
| Return panel | built |
| Support form | built |
| Announcement bar | built |
| Editorial blocks | built |
| Theme toggle | built |

## Seller UI (Atelier)

| Component | Status |
|---|---|
| Dashboard stats | new |
| Queue row table + decision bar + reason sheet | partial (cards today) |
| Dispatch inline (tracking field, later courier booking) | built (card) |
| Listing table | partial |
| Listing editor (two-column desktop, gaps panel) | built (single column) |
| Photo manager inside editor | built (separate) |
| Returns queue | built |
| Ledger + statement + dispute | partial (statement; no ledger) |
| Attribution line per order | new |
| Staff table | new |
| House profile editor (mark, banner, story, terms) | new |
| Notification preferences | new |

## Operations UI (Atelier)

| Component | Status |
|---|---|
| Today / exceptions list | new |
| Order search + customer timeline | new |
| Work queue (delivery, remittance) | built |
| Refuse / cancel actions with reason and cost bearer | new |
| Applications board + verification checklist | built |
| Moderation queue | built |
| Review moderation | built |
| Returns board + refund proposal | built (refund; no ledger) |
| Support queue + thread | built |
| Content list/editor/preview, site, announcements | built |
| Audit log | built |
| Insights | built |
| Payout draft/approve/paid | new |
| Policy editors (rates, fee terms, windows, checkout policy) | new |
| Reconciliation (courier statements) | new |
