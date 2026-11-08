# Seller workspace — local review handoff

Owner: Codex. Date: 6 November 2026.
Branch: `codex/diyar-seller-workspace`, based on fetched main `5dd1891`.
Local only: no push, remote branch, PR, deployment, production/staging migration or live-data change.

## Implemented scope

The founder approved the four-screen seller concept in this conversation. Shared
forest-green navigation, ivory panels, responsive Arabic layout, account/help page
and the existing dark theme now wrap overview, orders, products, editor, returns
and payout statements. Seller sign-in lands on the overview. No navigation points
to a fictitious customer, promotional or staff-management capability.

- Overview: working 7/30/90 Cairo-calendar selectors, delivery-value chart with
  pointer/keyboard inspection and accessible table, factual metrics, top SKU units,
  actionable links, SLA and stock alerts. Secondary operational detail is collapsed.
- Orders: searchable/filterable responsive table and selected detail pane, real
  confirmation, coded rejection and tracked dispatch; existing state machine unchanged.
- Products: real SKU and verified-thumbnail payload, missing draft values marked
  unrecorded, state/search filters, draft creation, grouped editor and photo refresh.
  Withdrawal/restoration no longer attempts an illegal save of locked states first.
- Returns: state filters, readable cases and existing domain-permitted decisions.
- Payouts: paid versus unpaid statement-net sums, reference/status filters, detailed
  source/rate arithmetic, dispute dates, read-only safe CSV and restored focus.
  Sellers cannot issue transfers, mark payments or change commission.
- Account: existing sign-out-everywhere action and real support destination.

## Data definitions and isolation

All records come through existing seller sessions, API ports and RLS. The profile
endpoint has no seller selector and exposes only current-context public house metadata.
Catalogue photo reads stay inside the seller-scoped transaction and now use verified-primary batches of at most 100 product IDs. The compatible full-list endpoint costs 1 + ceil(N/100) reads; the opt-in keyset endpoint uses at most two reads per page. No platform/global media access was added.

Existing `sub_orders.delivered_at` is now exposed through the queue port/SQL/memory
adapter and API. It does not require a migration. Gross delivery value is merchandise
on currently delivered own suborders, by actual Cairo delivery day, before commission,
shipping and reconciliation. Any order with a recorded return is conservatively
excluded, even if that return was declined. This is NOT net revenue or cash received.
Placed-order counts use placement dates; averages/top SKU units use the same included
deliveries as gross. Legacy delivered rows with no delivery timestamp are excluded.

Stock is recorded product stock, NOT available-minus-reserved. Low stock means a
published listing with a recorded quantity from 1 to 5; no recorded quantity is not
silently equivalent to zero. Financial zeroes are sums of accessible statements,
not bank balances; database owner-only payout policies remain authoritative.

## Verification and remaining boundaries

Focused model/copy/dependency/API/adapter checks, web strict types, production build,
and local Chrome responsive/interaction/accessibility checks are recorded in the
completion response. Screenshots are generated locally and are not committed.

The inventory backend now supports reserved/available quantities, an immutable movement history and reasoned CAS/idempotent adjustments. The existing product listing still displays physical recorded stock; no warehouse or variant allocation UI is claimed.

Customer rankings are now implemented as an explicitly authorized private owner-only named leaderboard and own-brand purchase profile at /seller/customers. Existing customer/parent-order RLS remains unchanged; the capability functions independently check active ownership. Profiles expose customer-provided name and own completed-order references/dates, not contact details or other-brand history. Public shoutouts still require separate permission. No loyalty/reward policy was added.

Seller pages now support Arabic and English via the shared AR / EN switch and
`/en/seller/...` routing. Product names and customer-entered content remain as recorded. Staff
CRUD, promotions and public customer recognition are not part of this local version.

## Local preview

`/seller/local-preview` is an explicitly requested temporary developer entry. It
creates a real revocable session for a seeded brand only when ALL are true:
NODE_ENV=development; DIYAR_LOCAL_SELLER_PREVIEW=true; DATABASE_URL absent;
PGLITE_DIR equals one of the two explicitly named isolated demo directories (diyar-mock-animation-preview/pg or diyar-backend-preview/pg under D:/DIYAR-local/tmp); host is loopback port3100;
request is not cross-site. Otherwise 404. Production sign-in is unchanged.
Remove this developer adapter or leave its flag unset before sharing a deployed build.

The earlier homepage changes remain preserved on their original local branch and
named Git stash. Do not apply them over this branch without deliberate integration.

## Completion evidence

- Optimized web build and strict web types passed.
- Seller model/copy/dependency checks: 24 passed.
- Touched API boundary suite: 106 passed (including profile isolation, catalogue media
  scoping and existing seller/order/payout behavior). A filtered run initially skipped
  required review fixtures; the complete file was then run successfully.
- Palette/style guards: 118 passed, including the new seller contrast check.
- Shared delivery timestamp contract: in-memory and disposable PGlite adapters passed.
- Browser: six pages at 360/390/768/1440 (24 layouts), plus dark overview; no horizontal
  overflow, page errors or main-content A/AA axe violations. Period selection, chart
  keyboard interaction, order detail open/close, order/product search were exercised.
- No claim of an external production deployment, legal approval or measured conversion lift.

## Seller language completion — 6 November 2026

The workspace and sign-in now offer AR / EN. Language changes reload the document
to apply matching lang/dir and preserve the current route and query. Seller links,
auth redirects and the gated local preview retain the selected language.
All six workspace pages, product editor/options, known action errors, Cairo dates
and CSV headers support English. Unrecognized Arabic server errors use a readable
English recovery message; source product/customer content is not translated.
Financial calculations, authorization, sessions and production preview gates are unchanged.

Verification: 13 focused locale-routing, translation, copy-layer and CSV tests passed; strict web types passed;
browser checks across six English pages at 360/768/1440, product editor labels,
chart keyboard interaction, order search/detail, AR/EN round trip, English sign-in
and main-content accessibility. No remote writes or deployment.

## Backend follow-up — 8 November 2026

See SELLER_BACKEND_REFINEMENTS.md for inventory, catalogue, customer and refund safeguards and remaining financial policy/provider boundaries. A fresh diyar-backend-preview fixture was created for final UI checks; the original local preview and ZIP workspace were preserved. New migration sources were applied only to disposable tests and this new isolated synthetic demo, never production/staging.
