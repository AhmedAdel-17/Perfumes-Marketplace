# Design system

Two surfaces, one token source. **Maison** is the shopfront and storefronts: space,
photography, restraint, the doctrine as written. **Atelier** is every operating tool
(seller portal, ops console): dense, tabular, fast to scan, the same palette and faces at a
working scale. Today only Maison exists and Atelier borrows its clothes; that is the single
largest visual defect in the tools.

Governance: primitives live in `packages/ui/src/primitives` (web) and are the only place a
raw Tailwind class for colour, radius, type size or motion may appear. Features compose
primitives. This is ARCHITECTURE §4's `design-system/` folder, finally created.

---

## 1. Foundations (existing, kept)

| Token group | Source | Notes |
|---|---|---|
| Colour roles | `theme.ts` → `bg-ground/raised/plate`, `text-ink/ink2/ink3/accent/danger`, `border-line`, `bg-accent-surface`, `text-on-accent` | primitives never named; both themes |
| Data colours | `noteTier`, `scentFamily` | visualisation only |
| Type faces | Amiri 400 · Bodoni Moda 400 · IBM Plex Sans Arabic 400/500/600 | |
| Maison type ramp | micro 9.5 · caption 10.5 · small 11.5 · body 13 · bodyLg 14 · h4 19 · h3 22 · h2 24 · h1 33 · from 1024: h4Lg 21 · h3Lg 27 · h2Lg 34 · h1Lg 52 · displayLg 72 · displayXl 108 | |
| Spacing | 4 8 12 16 22 26 34 48 | |
| Radius | 0 / 2 / 3 / pill (avatars only) | |
| Motion | 120 / 240 / 420 / 640 ms; `out`, `inOut`, `entrance` | no spring |
| Sizes | touch 44 · control 52 · phoneMax 440 · contentMax 1240 · proseMax 620 | |
| Elevation | none; value steps + hairline | |

## 2. Foundations to add (tokens.json, then tests)

```jsonc
"atelier": {
  "fontSize": { "meta": 11, "cell": 12.5, "body": 13.5, "label": 12, "h3": 16, "h2": 20, "h1": 26 },
  "lineHeight": { "cell": 1.4, "body": 1.55 },
  "space":   { "cell": 10, "row": 12, "group": 20, "section": 32 },
  "control": 40,
  "$rule": "A tool is read in rows, not paragraphs. 26px is the largest heading a console gets."
},
"status": {
  "$rule": "Outlined pills only. Colour never alone: every pill has a word.",
  "neutral": "ink3", "attention": "accent", "danger": "danger", "success": "ink"
},
"photo": {
  "tile": "4:5", "hero": "1:1", "house": "3:1", "min": { "w": 1000, "h": 1250 },
  "placeholder": "flacon", "$rule": "Never upscale. Blur-up in the house's accent tint."
},
"letterSpacing": { "label": 2.4, "wordmark": 8, "tight": -0.4, "meta": 1.2 }
```

Keep one palette (law IV). Atelier uses the same roles; it differs in scale, density and
components, not in colour.

## 3. Primitives (`packages/ui/src/primitives`)

Every interactive primitive defines rest · press · focus · disabled · loading. Every list
primitive defines loading (skeleton) · empty · error · end.

| Primitive | Variants | Notes |
|---|---|---|
| `Text` | display, h1–h4, body, label (Bodoni, letterspaced), meta, num (tabular) | Arabic leading built in; `.latin` isolation for Latin runs |
| `Button` | primary (solid accent, **no gradient**), secondary (outlined), quiet (text), destructive (outlined danger); sizes maison/atelier | 44 pt hit area; loading replaces label with a hairline progress, never a spinner |
| `IconButton` | with required `aria-label` | |
| `Field` family | `TextField`, `PhoneField` (Arabic-Indic → Western, +20 handling), `NumberField`, `TextArea`, `Select` (custom listbox, keyboard, RTL), `Radio`/`Choice` cards, `Checkbox`, `FileDrop` | label, hint, error, adornments; `inputMode` decides digit handling |
| `Surface` | ground, raised (l1), panel (l2), plate (dark-scoped) | hairline by default |
| `Divider` | hair, section | |
| `StatusPill` | neutral, attention, danger, success | outlined; word required |
| `Skeleton` | text, block, tile, row | matches final dimensions exactly |
| `Sheet` / `Drawer` | bottom (phone), end-side (desktop) | for compare tray, filters on phone, decline reasons |
| `Toast` | **not provided** (doctrine §3) — outcomes are shown inline | |
| `Table` (Atelier) | sticky header, row link, sortable columns, density, keyboard-reachable scroll region | keyset "load more" |
| `DataList` (Atelier) | label/value pairs | order details |
| `Stat` (Atelier) | number + label + delta | dashboards |
| `Timeline` | steps with state; fills from the right in RTL | tracking, return case, audit |
| `Countdown` | deadline → "23h 59m" with breach state | queues |
| `Money` | amount + `EGP` label, tabular, locale digits per rule | everywhere |
| `Meter` | intensity bands, fills from the right, source line | performance |
| `Photo` | ratio-locked, blur-up, `next/image` sizes preset | tiles, hero |
| `Mark` | house mark or fallback monogram | trust |

## 4. Composite components (features)

| Component | Where | Purpose |
|---|---|---|
| `HouseCard` | home, houses, search | mark, name, city, verified line, rating, "ships in N days", product count |
| `ProductTile` (revised) | grids | photo 4:5, house line with mark, name, family · size, rating summary, price, delivery hint |
| `TrustRow` | product, checkout | verified house · COD available · returns (eligibility from the listing) · delivery window and fee to selected governorate |
| `RatingSummary` | tile, product top, house | average + count + "verified purchases" |
| `CompareTray` + `CompareTable` | search, product | up to 3; concentration, family, notes, bands with source, size, price, house, delivery |
| `ShipmentGroup` | cart, checkout, tracking | per-house block: items, fee, window, state |
| `OrderTimeline` | tracking | placed → confirmed → dispatched → delivered, per house |
| `QueueRow` (Atelier) | seller queue | countdown, reference, items, recipient, actions in one row; expands |
| `DecisionBar` (Atelier) | seller/ops | confirm/decline with reason sheet; disabled until legal |
| `Ledger` (Atelier) | payouts | entries, statement, dispute deadline |
| `ExceptionList` (Atelier) | ops | the daily report |

## 5. Rules (from the doctrine, made checkable)

- Colour never alone: status has a word; meters have a label.
- Digits: Western for data (prices, phones, references, tables); Arabic-Indic for editorial
  counts through `counted()`. Unchanged.
- No alpha on ink roles; tinted grounds only with outlined text (tint test exists).
- Skeletons, not spinners; images fade over `motion.base`.
- Empty states are designed: illustration-free, one sentence, one action.
- Every route group has `loading.tsx` and `error.tsx`.
- Tool headings ≤ 26 px; storefront display ≥ 52 px at ≥1024.
- Photos: minimum 1000×1250, ratio locked, never upscaled; the illustrated flacon is the
  placeholder and is labelled as such in the seller portal ("no photograph yet").

## 6. Accessibility floor (audited by `audit.mjs`, extended)

WCAG 2.1 AA; 44 pt targets; 4.5:1; visible focus; keyboard for every flow; `aria-live`
for inline outcomes; reduced motion; RTL geometry assertions for meters, timelines,
drawers. Add: screen-reader pass on checkout and queue once per release.
