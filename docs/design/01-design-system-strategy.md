# Design system strategy

Relationship to existing documents: `docs/DESIGN_DOCTRINE.md` (laws, FACT),
`docs/frontend/02-design-system.md` (engineering-level spec written in the audit phase),
`docs/brand/06` (visual direction). This document sets the strategy: what the system is
for, how it is governed, and what belongs to which UI.

## 1. Purpose

One token source, two languages (Maison for customers, Atelier for houses and operators),
zero third-party components, every state designed. The system exists so that a hundred
houses can look like themselves inside one frame, and so that a house can confirm an order
in seconds without reading a brochure.

## 2. Tokens (FACT today; additions in `docs/frontend/02` §2)

| Group | State |
|---|---|
| Colour roles (two themes) | built, tested for contrast in both directions |
| Data colours (note tiers, families) | built |
| Type faces and Maison ramp | built |
| Atelier ramp | to add |
| Spacing, radius (0–3), hairline, no elevation | built |
| Motion durations and easings | built |
| Sizes (44 pt target, content widths) | built |
| Status (outlined pills, word required) | to formalise |
| Photo ratios and minimums | to add |

## 3. Grid

Maison: 4-column phone (16 px gutter), 8-column tablet, 12-column desktop at 1240 max;
product 7/5; grids 2 → 3 → 4. Atelier: full-width work area with a 240–280 px navigation
column at ≥1024; tables span; detail panes as end-side drawers.

## 4. Elevation and depth

None by shadow. Depth by value steps (l1–l3) and hairlines (FACT rule). Drawers and sheets
use a scrim (opacity token) rather than a shadow.

## 5. Motion principles

Things settle (doctrine law VI). Maison 420–640 ms entrances, once per route; Atelier
120–240 ms state changes only. Reduced motion honoured. No spinners: skeletons and hairline
progress.

## 6. Ownership by UI

| Belongs to CUSTOMER UI (Maison) | Belongs to SELLER UI (Atelier) | Belongs to OPERATIONS UI (Atelier) | Shared |
|---|---|---|---|
| photo, tile, house card, hero, compare tray/table, trust row, rating summary, shipment group, checkout steps, order timeline, review form, return panel, support form, editorial blocks | dashboard stats, queue row, decision bar, listing editor, photo manager, ledger/statement, staff table, house profile editor | today/exceptions list, order search + customer timeline, verification checklist, moderation queue, review moderation, returns board, ticket thread, content editor, audit log, insights, payouts approval, policy editors | text, button, icon button, fields, select, choice cards, surface, divider, status pill, skeleton, drawer/sheet, table, data list, timeline, countdown, money, meter, mark, empty/error/loading states |

## 7. Governance

- Primitives live in one package; features compose them; a dependency test forbids
  primitives importing features.
- Every primitive documents five interactive states and every list primitive five data
  states before it is merged.
- Token changes are reviewed against the contrast tests in both themes.
- A states page (dev only) shows every primitive in every state; the accessibility audit
  runs on it.
- Visual baselines per theme and width; changes to baselines are deliberate.
- The doctrine's detail checklist runs per screen; "would Dior ship this screen" is the
  final review, with the founder.

## 8. Anti-patterns (from the doctrine's instant-death list, FACT)

Shadows as separators, pill buttons with gradients, a second accent, bouncy motion, emoji,
toasts for routine actions, stock photos, badges, exclamation marks, inconsistent stroke
weights or radii, greys past the contrast floor, alpha on ink roles, hardcoded values.
