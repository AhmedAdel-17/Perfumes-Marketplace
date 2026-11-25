# Contemporary Egyptian art-direction preview

19 November 2026. Local branch: codex/diyar-egyptian-art-direction, based on seller-workspace 508f3dd. No push or deployment.

Composition/decorator pattern keeps catalogue, curation, prices, stock, cart, reveal, loupe, scent clock and house facts on existing contracts. The existing storefront remains the default unless NODE_ENV=development and DIYAR_ART_DIRECTION=true. Backend, authentication and schema are unchanged.

## Review

- http://localhost:3100/en and / (Arabic): editorial home, three real catalogue cards, named houses and note discovery. Operator curation remains authoritative; no invented sales or popularity claims.
- Follow an existing house link: illustrative studio opening plus existing real house facts and product collection.
- Follow a product: editorial introduction plus existing buying controls, bottle inspection and scent clock.
- Seller workspace: shared visual refinements cover overview, orders, products/stock, returns, payouts, customers and settings; existing actions and permissions remain unchanged.
- Operations: shared navigation and table/form styling cover all 12 existing sections; queue summaries use existing loaded data.
- House directory uses image cards instead of the previous table in art mode. Catalogue, bag, checkout and order tracking use the shared editorial presentation.

## Image provenance

public/art-direction/atelier.webp is generated editorial artwork (19 November 2026), optimized to about 146KB. It depicts a fictional studio and bottle, not a real house, maker or purchasable product. Its on-page caption discloses this. Original generated source: exec-d010e78a-b0be-45c7-a90b-74360f5c481d.png. Actual catalogue images retain existing sources and metadata. No mock UI screenshots are used as website images.

## Scope

This is a local art-direction review, not the complete implementation of every screen in the UI blueprint. Approved maker portraits, unique house photography and new account/profile workflows remain separate work. Do not present this as production-ready.

## Local launch

Use the existing isolated synthetic database/media directories, never production credentials. Set DIYAR_ART_DIRECTION=true, PGLITE_DIR and MEDIA_DIR to those local directories and launch the installed Next CLI on port 3100. Current review uses D:/DIYAR-local/tmp/diyar-backend-preview. No seed or migration command was executed for this UI change.

## Verification

Web TypeScript check passed. Existing copy-layer and seller-locale tests: 7 passed. Browser checks are recorded in the task completion. No full production build was run; review scope is the local UI and C: has no free space.

Browser review: English home, existing house and product routes returned 200 without page errors or horizontal overflow at desktop. Product preview retained real availability: the inspected Palms of Siwa is currently unavailable; no inventory was changed to force a sale. The existing reveal and scent-clock controls remain present. An initial /ar check returned 404 because Arabic uses the root / route; use the documented root route instead.
Arabic root route verified at 390, 768 and 1440px: HTTP 200, lang=ar, dir=rtl, no horizontal overflow and no browser page errors.

## Latest validation and open work

19 November: web TypeScript passed; focused copy-layer/seller-locale tests: 7 passed. All 12 operations routes returned 200 without desktop horizontal overflow. Fixed sidebar containment by disabling the main entrance transform in the operations preview. No financial or order action was submitted.

Fresh English house-directory and cart sessions load. The English redirect loop was traced to the local Next server binding 127.0.0.1 while receiving localhost rewrites. Restarting with -H localhost resolved it; no middleware/authentication change was retained. English navigation with a remembered locale and the seller demo entry now work. Route status alone does not prove streamed content or all interactions have finished; visual and interaction acceptance remains necessary.

This work is not complete blueprint delivery: production customer account/profile integration, exhaustive page-by-page state acceptance and English operations localization are not delivered. Customer account and house-settings design proposals are now available in the development-only review index. The current preview must not be described as production-ready or as implementing every MD screen.

## Desktop review update

Current user priority is desktop only; mobile work is deferred. /design-preview (Arabic) and /en/design-preview (English) provide isolated interactive proposals for sign-in, profile, preferences, addresses, privacy, linking/recovery, order history/split parcels, return requests, team and house presentation. No API call, persistence, session issuance, email/SMS, invitation or refund is performed by these proposals. Their visible banner states that changes are not saved. The route returns notFound unless the development art-direction toggle is enabled.

Verified: 9 English customer/review routes returned 200 without desktop overflow; all 7 seller pages returned 200 without desktop overflow; seller period selector changed to 7 days; sample addresses, order selection/two parcel display and invitation feedback behaved as intended. Arabic review renders RTL. TypeScript passed, and both focused localization test files passed (7 tests). Operations loaded-state screenshot confirms the queue summary is rendered and its fixed sidebar no longer overlaps content.

See DESKTOP_SCREEN_INDEX.md for connected/proposed boundaries. No push, deployment, production migration or backend change.

### Correction: original note-paper interaction

The first ArtProductCard adapter omitted the original Blotter component; preserving reveal attributes alone did not preserve this hover interaction. Restored the same original component by exporting and reusing it inside the art card photo frame. Desktop browser verification: paper opacity 0 at rest, 1 on hover, 1 on keyboard focus; actual top notes rendered. This correction applies to all pages using ArtProductCard. Do not describe a visual adapter as preserving all behavior without checking its original interactive children.

## Reference-led desktop refinement — 19 November 2026

The supplied storefront/seller concept boards are the visual reference, not evidence of backend capability. This pass changes actual React composition and shared design tokens, rather than only spacing on the previous layout:

- Contained two-column home hero with intentional bilingual line breaks, source-token olive action, compact featured product rail, balanced house section and a working native GET header search.
- Shared product cards now have consistent square catalogue imagery, real price/brand/facts hierarchy and rounded panels. Featured cards use a horizontal composition at wide desktop widths. The exact original Blotter remains inside the photo frame; reveal kit/frame attributes remain unchanged.
- House cards preserve whole source images rather than cropping bottles into landscape banners. Approved actual house photography is still a content dependency; source product images are not claimed as architecture or maker portraits.
- Catalogue has four desktop product columns, a narrower filter rail and checkbox-style toggle buttons retaining the original aria-pressed state and URL behavior.
- Seller overview now composes the existing chart, attention queue and top-product list side by side. Current seller listing photos are matched by SKU for thumbnails; metrics and historical financial calculation logic are unchanged.
- Source-defined ivory/forest/olive palette, panel/control radii, compact workspace headings, navigation, tables, factual status treatments and sticky order detail panels. New colors are opt-in through ART_WORKSPACE_STYLE. Original workspace tokens remain available.
- Product/house decorative introductions are condensed. Checkout retains the actual native form/validation/summary but removes the unrelated image column and redundant wrapper copy; compact contact fields share a desktop row.
- Operations uses the same scoped palette and panel grammar; authorization/actions are unchanged.

Verification: web TypeScript passed; focused copy-layer and seller-locale tests passed (7). Browser interaction verification passed for hover and keyboard note paper (opacity 1), native header search, active family filter, populated checkout, seller 7-day selector and opening order details; no browser page errors were observed in that run. No order was submitted or operational action executed. Desktop customer pages checked had no horizontal overflow. New palette text contrast pairs measured 6.76:1 or higher (minimum 4.5:1). Screenshots and interaction JSON are outside the repository at D:/DIYAR-local/tmp/art-preview/reference-pass.

This is a closer implementation for review, not a claim of pixel-perfect reproduction or complete production readiness. Unsupported account/team/publishing features remain explicitly labelled design previews. No backend, authentication, schema, migration or data-fixture source was changed by this refinement. No push or deployment.


## Editorial luxury refinement — 19 November 2026

Supersedes the contained split hero, square bordered cards and horizontal featured rail described above. The local art-direction preview now uses a seamless masked background hero, heavier self-hosted Newsreader headings, a restrained magnetic CTA/arrow, and borderless 4:5 product photography on source-defined cream and stone tokens. The original note-paper hover/focus, reveal attributes, actual prices, routes and server data fetching are retained. House imagery remains product references pending approved house photography.

Lenis smooths public storefront wheel scrolling; the Scent Map and seller/operations consoles retain native scrolling. Framer Motion provides masked headline entrance, transform-only image parallax and staggered product/house entrances. Reduced-motion preferences disable smooth scrolling and decorative motion. Scroll locking for the product reveal is observed; nested scroll surfaces remain native. Content is visible in server HTML without animation. These changes are still behind the existing development art-direction flag. No universal 60fps guarantee is made.

Validation: TypeScript passed; 7 existing copy/locale tests passed. Local Chrome verified Home/Search/Scent Map HTTP 200 with no page errors or desktop horizontal overflow, product border 0, image ratio 4:5, multiply blending, hover scale 1.05 and keyboard note-paper opacity 1. Screenshots are outside the repository at D:/DIYAR-local/tmp/art-preview/luxury-polish. No backend, authentication, schema, migration, push or deployment changes.


## Product inspection and note stages — 19 November 2026

The product page keeps its original server fetching, metadata, structured data, photograph/loupe, relief-based reveal, Mist/Skin Dial and bag actions. A separate lazy client-only Fiber/Drei canvas opens from Inspect in 3D. The procedural MeshPhysicalMaterial bottle is explicitly an illustrative study, not a brand-accurate digital twin. Studio reflection maps are generated locally; no external HDRI or font downloads are required. Orbit controls support pause, rotation, bounded zoom and reset, with native modal focus/scroll locking, Escape and reduced-motion handling. The scene unmounts on close.

A future approved same-origin .glb can be supplied through BottleInspection.modelUrl. No model URL field was invented in the database; compressed GLBs requiring external Draco/Meshopt decoders are not enabled. WebGL-unavailable/context-loss and loading failures have a text fallback and leave the original product photograph available.

Notes over time renders the existing top/heart/base note arrays and glossary translations; legend and SVG segments work with pointer, click, focus, Enter and Space. The 0–15 minute / 15 minute–4 hour / 4 hour+ ranges are clearly described as indicative stages, not measured product-specific performance. Existing longevity/projection segmented meters animate on viewport entry without changing their bands or source labels. Sillage is not supplied by the current product contract and was not fabricated.

Validation: TypeScript passed; 21 focused locale, loupe and reveal tests passed. Local Chrome verified no 3D scene chunk before activation, actual WebGL rendering, zoom changing the render, reset/pause, Escape and focus restoration, Arabic/RTL, dark mode, reduced-motion rotation suppression, keyboard/pointer note selection, preserved Mist control and Add-to-bag drawer trigger, and the no-WebGL fallback. No browser page errors were observed in the supported-WebGL run. Screenshots remain outside the repository under D:/DIYAR-local/tmp/art-preview/luxury-polish. This is a local visual implementation, not a GPU performance certification or production deployment. No backend/schema/data changes, push or deployment.


### Live tester refinement — 20 November 2026

Only the inspection scene changed: a floating theme-aware spray/pause/reset toolbar replaces the rectangular viewer controls; wheel/pinch zoom remains on OrbitControls. The procedural bottle exposes a pressable atomizer instead of its cap. Opening or spraying starts a finite 56-sprite soft mist simulation (a visual approximation, not a volumetric fluid simulation), followed by projected badges from the existing unique top/heart/base note names and glossary translations. Badges follow camera orbit in scene space; no stage/time switcher was added. A future arbitrary GLB is rendered as supplied; animating its specific nozzle would require a known rig/mesh contract. Reduced motion suppresses the moving nozzle, mist and badge entrance while keeping the real note labels visible. Pausing automatic rotation still allows a finite spray to invalidate demand-render frames, and closing unmounts the scene.

Validation: TypeScript and 17 focused copy/loupe/reveal tests passed. Local software-WebGL Chrome verified all four existing White Musk note names, spray after pausing, simplified controls and Escape dismissal. Existing page fetching, Mist/Skin Dial, Notes over time, cart and pricing logic were not changed; only existing note props were passed into the inspection. Local only; no push.

Follow-up verification: note badges use camera-projected DOM pins rather than separate Drei Html roots, avoiding portal cleanup conflicts on replay/close. The controls and label text remain in the modal’s normal DOM lifecycle.


## Seller analytics and order quick actions — 20 November 2026

Overview now displays the unchanged buildOverviewPeriod daily cohorts through a responsive Recharts monotone area chart, source-theme olive/gold stroke, fading fill, dashed grid, padded/nice zero-based monetary axis, keyboard-accessible exact date/value/count tooltip and the existing daily table. Integer piastres and Cairo date grouping remain authoritative. KPI cards add icons, reduced-motion-aware stagger/hover and factual selected-period pills; no period-comparison percentage is fabricated. Sidebar and shared workspace palette are unchanged.

OrderQueue keeps its existing fetchQueue and confirmSubOrder/declineSubOrder/dispatchSubOrder functions and concurrency guard. Row clicks and existing action buttons open a native modal slide-over with retained hash linking, customer/recipient details, bottle quantities, separate merchandise/shipping/total figures, source status and the original action controls. Errors and refresh recovery are visible inside the drawer. Native modal isolation plus keyboard wrapping, focus restoration, Escape/backdrop dismissal and logical-edge placement support EN/LTR and AR/RTL; the dialog remains under the seller theme scope. No action is executed merely by opening or closing it.

Verification: TypeScript and 15 focused overview-model/locale/copy tests passed. Local Chrome verified seven-day table rows, exact tooltip (15 Nov 2026, 450 EGP, one delivered order in the local demo), period controls, row and action-button opening, focus trap, Escape/backdrop close, existing confirm/dispatch controls (without submitting), RTL left-edge drawer, dark gold chart, no desktop horizontal overflow or browser page errors in the checked flows. Existing calculation and mutation files have no diff. Screenshots: D:/DIYAR-local/tmp/art-preview/seller-analytics. No financial/fulfilment mutation was submitted, no production migration/deployment and no push.


## Selective partner integration — 25 November 2026

Branch: codex/diyar-selective-partner-fixes-20261125. Our uncommitted art direction, seller workspace, bag drawer, notes, live tester and existing backend safeguards remain the baseline. Partner sources: fca6e4e (order correctness) and selected non-design portions of c8ea419 (checkout/SEO). No homepage/product/card redesign, deletions, global theme replacement or partner error-page styling was imported.

Integrated: optional checkout replay keys with transactional unique storage; each stored key additionally binds a SHA-256 digest of the parsed request, rejecting reuse for changed details. The current web checkout always supplies a key; legacy direct callers omitting it retain the prior non-idempotent behavior. Browser retry keys persist only a request digest and random key, not contact/address data; an in-memory guard prevents same-render double submission. Delivery confirmation records operator identity in the same transaction. Remittance requires a delivered order and an existing shipment. Our stock and refund logic is preserved.

Checkout retains our layout while adding first-invalid-field focus, policy links, one-hour tab-scoped confirmation, reference copy and reference-prefilled tracking. Confirmation storage holds no name/phone/address and is a convenience, never transaction authority. Public sitemap and robots rules are added, including exclusion of design previews; host/protocol follow the request with HTTPS fallback outside localhost.

Migration lineage: our existing 0042 customer insights, 0043 reservations and 0044 refunds are untouched. Partner additions are appended as 0045_delivery_audit_action.sql and 0046_order_placements.sql (with request_hash). This sequence targets OUR local ledger. A database already migrated through the partner/main 0042/0043 has a different history: do not run this sequence against it or rename existing ledger entries; reconcile/export into a separately reviewed migration plan first. Checksummed migration guards remain enforced.

Preservation: source snapshot D:/DIYAR-local/tmp/selective-partner-backup-20261125-1795626266989; closed demo-store backup D:/DIYAR-local/tmp/selective-demo-db-before-20261125-1795626644919. Only the existing isolated D:/DIYAR-local/tmp/diyar-backend-preview/pg demo received 0045/0046; no seed or network/staging/production migration was run.

Validation: web/API/database TypeScript passed; six focused API integrity cases (including duplicate/racing requests, changed-request rejection, delivery audit and undelivered remittance refusal), 25 migration/inventory/refund tests, and seven copy/locale tests passed. API race coverage here uses PGlite; native PostgreSQL multi-session validation remains a release check. Browser verified our original hero, invalid-field focus, policy links, refresh-safe confirmation and prefilled tracking using browser-only synthetic confirmation data, plus robots/sitemap HTTP 200 and no observed page errors. No order or financial mutation was submitted to the demo during browser verification. No full production build, remote push, merge into main or deployment.

## Customer website completion — 25 November 2026

See CUSTOMER_ACCOUNT_HANDOFF.md for the connected customer account, required phone sign-in/profile checkout, addresses, own order history, consent ledger, recovery states and seller storefront. Local additive migrations 0047/0048 only; no push or deployment. Content approval inputs are in CONTENT_APPROVAL_CHECKLIST.md. Existing identity/financial migration lineage warnings above still apply.

## Approved review branch — 25 November 2026

The founder approved publishing the complete current snapshot to codex/diyar-storefront-customer-seller-20261125, separately from main. This supersedes earlier local-only publishing restrictions for this branch push only. No PR, merge, deployment or production migration is included. Customer implementation and content approval requirements remain documented in CUSTOMER_ACCOUNT_HANDOFF.md and CONTENT_APPROVAL_CHECKLIST.md.
