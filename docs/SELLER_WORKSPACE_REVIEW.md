# Seller workspace — local review handoff

Owner: Codex. Date: 6 November 2026.
Branch: `codex/diyar-seller-workspace`, based on fetched main `5dd1891`.
Local only: no push, remote branch, PR, deployment, migration or live-data change.

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
Catalogue photo reads stay inside one seller-scoped transaction (one listing read
plus one existing photo-port read per listing). This query cost should be revisited
if catalogue size requires pagination; no platform/global media reads were added.

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

The screenshot's Reserved column, movement history and reasoned stock adjustment
require an inventory-reservation/movement implementation. Those controls are not
invented here. Stock editing uses the established listing workflow.

Customer rankings remain blocked by deliberate parent-order/customer RLS: seller
suborders carry delivery recipients, not stable buyer identities. Do not group by
recipient phone/name or grant broad parent-order access. A separately approved
narrow owner-only aggregate returning per-seller pseudonyms is the next design step;
public shoutouts still require explicit permission. No loyalty/reward policy added.

Seller pages remain Arabic as the existing middleware specifies. Full bilingual seller
routing is not implemented. English mockup labels are not a claim otherwise. Staff
CRUD, promotions and public customer recognition are not part of this local version.

## Local preview

`/seller/local-preview` is an explicitly requested temporary developer entry. It
creates a real revocable session for a seeded brand only when ALL are true:
NODE_ENV=development; DIYAR_LOCAL_SELLER_PREVIEW=true; DATABASE_URL absent;
PGLITE_DIR equals the named isolated demo directory; host is loopback port3100;
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
