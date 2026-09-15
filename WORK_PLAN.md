# Work plan — autonomous run

**Standing instruction (4 September 2026):** work through this list phase by phase without
asking permission between phases. If a usage limit interrupts the session, the next session
resumes from the first unchecked box — no context needed beyond this file.

**How to resume:** open Claude Code in `D:\MyDownloads\diyar` and say "continue the work plan".

---

## 1. Three cosmetic fixes  ✅

- [x] 1.1 Grid never has more columns than products (home) and the related rail is width-capped
- [x] 1.2 My premise was WRONG — operating tools take Western digits by rule. Added internal() so the call sites state the rule instead of arriving at it by luck.
- [x] 1.3 Queue card reordered to the sequence of the work: countdown → what to pack → who to ring → address

## 2. Front-end review and polish, as a senior front-end engineer  ✅

Every surface, judged for deployment readiness. One pass per screen, then a whole-product pass.

- [x] 2.1 Home — grid capped to catalogue
- [x] 2.2 Product — wide content moved out of the narrow column; related rail sized not stretched
- [x] 2.3 Cart — image links named; CTA is a Link because it navigates
- [x] 2.4 Checkout — merchandise/delivery split restored; it vanished between bag and checkout
- [x] 2.5 Order confirmation + tracking
- [x] 2.6 Seller — queue reordered to the work; sign-in no longer dies silently on an exception
- [x] 2.7 Ops — waiting time added; a list without an age is not a queue
- [x] 2.8 Cross-cutting — automated as apps/web/scripts/audit.mjs. Eleven surfaces x six widths:
      overflow, 44pt targets (incl. ::after), axe wcag2aa, RTL direction and fill edges, focus
      rings, heading order, leaked enums. CLEAN.
- [x] 2.9 CLS 0. Bundle 102 KB shared + 2-6 KB/route. Dropped 3 unused font weights and gave every family a real Arabic fallback stack — swap-period text was resolving to Times on some Android builds.

## 3. QA, as a senior QA engineer  ✅

- [x] 3.1 38 end-to-end tests: buyer, seller, ops, in Chrome
- [x] 3.2 Every control exercised — stepper at its floor, dispatch below its minimum, decline path, empty bag, wrong code
- [x] 3.3 60 boundary/adversarial tests at the schema boundary + Arabic-Indic entry end to end
- [x] 3.4 axe across 11 surfaces × 6 widths; the purchase completed by keyboard alone
- [x] 3.5 Double-tap proven at the HOUSE, not the confirmation; two tabs; sign-out
- [x] 3.6 The quote reconciles against summary AND detail, and survives checkout, confirmation and a database round trip
- [x] 3.7 Authorisation matrix in the browser; 25 policy-shape tests over every table, present and future
- [x] 3.8 All fixed and re-run. QA_REPORT.md records each finding and why it survived

## 4. CMS  ✅

- [x] 4.1 Content model — a closed block set, not a rich-text box
- [x] 4.2 Draft/revision split, publishing state machine, editor vs publisher
- [x] 4.3 Migration 0009, RLS, immutability trigger, both adapters under one contract
- [x] 4.4 tRPC router with the public read separated from the console by procedure
- [x] 4.5 Public rendering, editorial route, footer directory
- [x] 4.6 The console: list, block editor, publish flow
- [x] 4.7 20 surfaces in the audit, 19 end-to-end tests over the CMS
- [x] 4.8 Revision history and restore — the reason immutable revisions exist
- [x] 4.9 Draft preview, platform-only, through the public renderer
- [x] 4.10 Announcements: one line, every screen, expires by itself
- [x] 4.11 Homepage curation: which product opens the site, and what leads the grid

Stack decision recorded in TECH_STACK §11 — built here rather than on Payload,
with the condition under which that should be reversed stated in advance.

---

## The remaining MVP gates

Doc 04 §8 lists eight acceptance gates for the MVP. Four are met. The rest are
the work, in the order below — chosen by what blocks the others, not by size.

| Gate (doc 04 §8) | State (updated 15 September 2026) |
|---|---|
| Seller approved, publishes a product, receives an attributed order, sees a statement | **blocked on media (5.7)** — approval, listing, moderation, attribution and statements all work; a listing cannot publish without a primary image, and there is no media store |
| Customer understands shipping and completes COD checkout | ✅ |
| Split order produces correct seller tasks and customer tracking | ✅ — and since 0020, a dispatch deadline per house |
| Cancelled, refused, returned, failed-payment states reconcile | ✅ — returns requested, decided and refunded through screens; refunds audited |
| Only delivered orders create verified-purchase reviews | ✅ — enforced in the domain, the router and a database trigger |
| Admin actions, fee changes and payout adjustments are auditable | ✅ — written in the decision's own transaction; readable at `/ops/audit` |
| Privacy, terms, seller agreement, return policy, prohibited products | **partial** — pages published through the CMS, prohibited-claim controls live; **pending counsel** on the wording, and the PDPL export/delete process is on the legal-review list before it may be built |
| Owner sees funnel, seller SLA and contribution without database work | ✅ for everything recorded — `/ops/insights`. Pre-order funnel blocked on A-1; a contribution margin on A-2 |

## 5. The seller's catalogue  ⬜

The largest remaining gap, and the one everything else waits on: today every
product in the system was seeded by hand. A marketplace where the platform
enters the catalogue is not a marketplace.

- [x] 5.1 Listing lifecycle — draft → pending_moderation → published ⇄ suspended
- [x] 5.2 The listing form — 24 fields in 6 groups, gaps counted while writing
- [x] 5.3 Platform moderation queue with coded reasons and a waiting clock
- [x] 5.4 Prohibited-claim controls: refused outright, or flagged for a person
- [x] 5.5 Stock and price editable on a live listing (the audit trail is §6)
- [x] 5.6 Domain tests, database guards, 19 surfaces in the audit
- [ ] 5.7 **Media — UNBLOCKED 15 Sep 2026 (M-1: Cloudflare R2).** A listing cannot
      publish without a primary image whose ownership is confirmed, and no house can
      add one. The schema (`product_media`) and the publish trigger already exist.
      - [x] 5.7.1 `MediaStore` port: presign an upload, verify what arrived, public URL
      - [x] 5.7.2 Adapters: R2 (S3 API, presigned PUT) and a local-disk store for
            development, refused in production by `assertProductionSafe`
      - [x] 5.7.3 Upload flow: the browser uploads straight to storage; the server
            checks type, size and dimensions of what ARRIVED before writing a row
      - [x] 5.7.4 The seller's photo manager: add, order, choose primary, alt text,
            ownership confirmation — and the listing gap closes. Photo changes are
            refused while a listing awaits review or is archived, by one domain
            rule shared by the form, the manager and every endpoint
      - [x] 5.7.5a Product tiles, the product page, the house page and search render
            the verified primary photograph (the flacon until there is one)
      - [x] 5.7.5b The bag shows the photograph too — its snapshot comes through the
            cart port, so both adapters and the cart contract gain the field. Read
            in the same query as the price; follows a change of primary (a mutation
            to either adapter's join fails the contract case)
      - [ ] 5.7.6 The CMS image block renders from the same store
      - [x] 5.7.7 Contract tests on both adapters, e2e, audit in both themes

## 6. The audit trail  ◐
- [x] 6.1 The port, both adapters, and a field-level diff
- [x] 6.2 Written by the decisions doc 04 §8 names — listing moderation, payout
      approval, remittance, policy publishing — inside the same transaction
- [x] 6.3 Proved from both sides: an entry exists after a decision, and a FAILED
      decision leaves none behind
- [x] 6.4 A console screen to read it without SQL (the second half of gate 6) —
      `/ops/audit`: filter by kind, keyset paging, every entry in words

## 7. Reviews  ✅
Verified purchase only, from delivered orders (gate 5). Shipped in e4486ad.

## 8. Refused and returned  ✅
Return requests, seller decisions, platform refunds. Shipped in e4486ad.

## 9. What the owner can see  ◐
Funnel, seller SLA, contribution inputs — without touching the database (gate 8).

- [x] 9.1 Definitions BEFORE a dashboard (doc 04 §6) — `docs/ANALYTICS_DEFINITIONS.md`.
      "Completed" is the payout's own `earned`; unrecorded inputs are shown as
      unrecorded, never as zero; hands back A-1..A-3.
- [x] 9.2 **The dispatch clock was never started.** `dispatch_due_at` has existed since
      0000 and nothing ever wrote it, so half of "seller SLA" did not exist and no house
      was shown a dispatch deadline. Migration 0020 snapshots the house's dispatch hours
      onto the sub-order; confirmation starts the clock; both adapters, contract cases,
      and the seller queue's countdown.
- [x] 9.3 Owner metrics computed in the domain from the same classifiers the payout run
      uses — one definition, two screens. `classifyForSettlement` is now the ONLY
      definition of "earned"; a parity test holds the report to the payout builder
      to the piastre, and was shown to fail when the rule is broken
- [x] 9.4 The owner screen (`/ops/insights`, admins only): money beside held money,
      the funnel with exits by reason, SLA per house, refusals by governorate, source
      mix, and contribution inputs with their status
- [ ] 9.5 Pre-order funnel — **unblocked 15 Sep 2026 (A-1 approved).** First-party
      events under an anonymous id, no personal data, no third-party script

## 10. Dependency security  ⬜
`pnpm audit` on 15 Sep 2026: 12 advisories (1 critical, 4 high). None is reachable in
the way its advisory describes, and none is left open on that argument.

- [ ] 10.1 `drizzle-orm` 0.38 → ≥0.45.2 (high: identifiers not escaped in `sql.identifier`
      / `sql.as`), with `drizzle-kit` 0.30 → 0.31. Runtime dependency — first.
- [ ] 10.2 `vitest` 2 → ≥4.1.11 across the six manifests; brings patched `vite` and
      `esbuild` (critical: the Vitest UI server — not installed here — and the dev
      server's path and origin checks). Development only.
- [ ] 10.3 `postcss` ≥8.5.23 under Next, by a pnpm override: Next's newest 15.x
      (15.5.25) still pins 8.4.31, and Next 16 is its own migration
- [ ] 10.4 `pnpm audit` clean, and a check that keeps it clean

Then the roadmap's Phase 2, and the mobile apps.

---

## Log

Newest last. One line per completed item, with anything the next session must know.

- 2026-09-04 — plan created.
- 2026-09-04 — §2 complete. Two operational hazards recorded in ARCHITECTURE.md: never open the PGlite dir from a second process, never run next build while next dev holds the same .next.
- 2026-09-04 — §2.8 done via a new audit script. It found 36 issues on first run, all fixed:
  heading skip on the PDP, two unnamed links in the bag, a 37px-wide sign-out target on three
  surfaces, and a note-tier colour at 3.87:1. Chasing that last one uncovered the palette living
  in THREE places and a drift guard now forbids repeating any token value as a literal — which
  found 28 more, including the heart note colour serving as the error colour in seven files.
  Also caught an RSC trap: a constant exported from a 'use client' module arrives at a server
  component as a throwing stub, and interpolating it put the text of that exception into a
  className. Nothing errored; the button just rendered 21px tall.
- 2026-09-04 — §1 done. Also found: both sign-in forms swallowed exceptions and left the
  button permanently disabled with no message; the product page put a time-series chart in the
  narrowest column on the page while its detail column ran 4x the height of the media beside it.
  Both fixed. 416 tests green.
- 2026-09-04 — §3 QA complete (QA_REPORT.md), §4 CMS complete, §5 seller catalogue
  complete except media, §6 audit trail written (console screen outstanding).
  769 tests, 19 audit surfaces, 56 end-to-end. 42 commits.

  **The one thing blocking MVP gate 1** is media: a listing cannot publish
  without a primary image whose ownership is confirmed, and a house has no way
  to add one. It needs a storage decision — provider, cost, signed uploads —
  which is Ahmed's to make, not mine. Everything on either side of it is built.

  Operational notes for the next session, both learned the hard way again:
  never run `pnpm seed` without `--fresh` against a database created before the
  migration ledger existed, and PowerShell's `-replace` on a file containing
  Arabic will corrupt the encoding — use python for edits to those files.

- 2026-09-05 — **§4 CMS finished against its own scope.** The three things it
  was missing are built: the revision history and restore that immutable
  revisions existed for, a platform-only draft preview through the public
  renderer, and site-level content — an announcement bar that expires by itself
  and homepage curation.

  Restoring deliberately does NOT publish; it loads the old text into the draft
  and stops. Announcements are the one unreviewed content type here, and the
  reasoning is written into migration 0013: urgency is the point, so the
  safeguards are a length cap, no markup, attribution, and a required window
  capped at a season.

  What the CMS still cannot do is IMAGES. The image block renders a visible
  placeholder because there is no media store — the same decision that blocks
  MVP gate 1 for listings, and it is Ahmed's to make: provider, cost, signed
  uploads.

  Also fixed in passing: `diffFields` in the audit trail could not describe a
  field being cleared, and the test saying so had been committed broken.

  812 tests, 20 audit surfaces, 64 end-to-end. 45 commits.

- 2026-09-07 — **Design review of all twelve surfaces, plus light mode.** Report:
  https://claude.ai/code/artifact/6c01fafe-361e-4960-b621-2b6c006ce137

  The §4b trap had been fixed on the home page and nowhere else. Nine of twelve
  surfaces drew a phone column on a 1440px monitor — the operating tools worst of
  all, with the seller queue a 664px column 6,555px tall and the confirm button
  521px from the order number it belonged to. Cart and checkout are two columns
  with a sticky summary now (the total is finally in view at the moment of the
  decision, which is what gate 2 actually asks for); the consoles have the content
  measure and their lists have COLUMNS, so width is room rather than distance.

  Light mode is built as a ROLE layer, not a second stylesheet: components name
  the job (`bg-ground`, `text-ink`, `text-accent`), theme.ts decides the value per
  theme, and the preset exposes only roles so `bg-noir` no longer compiles. The
  product plate stays dark in both — `data-theme` scopes roles on any element, so
  the hero is one attribute. Doctrine amended: law IV and a new §7.

  Found while doing it, all fixed: the ops console had four hand-written
  navigations and the queue offered no route to any other screen; the confirmation
  page's h1 contradicted the page beneath it; the notes pyramid's orb glow was
  `var(--note-top)2E`, which is not a colour, so the orbs have never been lit;
  `faint` cleared the floor on the page and failed it on an l3 panel;
  `text-accent/90` measured 4.08:1 on paper.

  **Never apply an alpha to an ink role.** Every ink sits just above 4.5:1 by
  construction, so an opacity spends a margin that was never there — and on noir
  it looks like a refinement and costs nothing visible, which is why it survives
  review. The audit now takes `THEME`; run it twice.

  Both themes: no findings, 20 surfaces, six widths. 812 tests green.

  **Open and Ahmed's to decide:** the media store (still gate 1, and it is now
  also why every product in the grid is the same bottle), and whether the palette
  stays noir/brass — the report proposes three alternatives and recommends
  keeping it. **Open and design's to draw:** the operating tools have never had a
  type scale of their own; they wear the storefront's 52px display headline.

- 2026-09-15 — **§6.4 done: the audit trail has a screen** (`/ops/audit`, commit
  dcee0ad). Keyset paging proved against both adapters, every entry in words, no
  write procedure. Widening the accessibility audit to seven screens it had never
  visited found three sub-44px targets and a 4.45:1 pill; fixed.

  **§9 started, and the first thing it found was a defect.** `dispatch_due_at`
  existed from migration 0000 and nothing ever wrote it: no house was shown a
  dispatch deadline and half of "seller SLA" did not exist. Migration 0020
  snapshots the house's dispatch hours onto each sub-order (a trigger fills it for
  any writer that omits it), confirmation starts the clock through one domain
  function, and the seller's shipping card now counts down. The in-memory adapter
  was also logging every transition as from-its-new-state; nothing read that log
  through the port, which is how it survived.

  `docs/ANALYTICS_DEFINITIONS.md` written BEFORE any dashboard: "completed" is the
  payout's own `earned`, and inputs the system does not record are shown as not
  recorded, never as zero. Nothing writes `analytics_events` today, so the
  pre-order half of the funnel is blocked on A-1 (a legal question, not code).

  Operational: a second e2e run on the same server fails at sign-in — the OTP
  limiter working as designed — and a persistent dev database makes the review
  tests fail on their second run. For a clean run: `seed -- --fresh`, restart.

- 2026-09-15 — **§9.3–9.4 done: gate 8 is met for everything the system records.**
  The owner report is a pure projection (`buildOwnerReport`) over one read port,
  proved against both adapters. Five decisions worth knowing:

  * "Completed" is the payout's own classifier, moved out of `SettlementService`
    so both call one function; `listForSettlement` and the report share one row
    mapping too, where "cash in hand" now means ANY shipment remitted (it depended
    on row order when a sub-order had two).
  * The confirmation SLA measures ANSWERING in time. The first draft of the
    definitions counted a prompt decline as late, which would teach houses to sit
    on orders they cannot fill; corrected before a line of it was built.
  * Periods are Cairo calendar days found, not computed: Egypt's daylight saving
    means +2 or +3, and one April day has no midnight. Two mutations (fixed +2,
    fixed +3) each fail the tests.
  * Rates cross the API as numerator and denominator; an unrecorded cost has no
    amount at all. No contribution margin is shown — four of eight terms is not a
    margin — until A-2 is decided.
  * Admin-only: take rate and revenue are not every operator's business.

  The audit found one real defect on the new screen: a wide table's scroll box was
  not keyboard-reachable at phone width. Fixed (focusable, named region). Layout
  tokens are now exposed as `min-w-*` as well as `max-w-*`, so a table floor is a
  token rather than a retyped pixel value.

  Tests: domain 596, api 229, db 287, i18n 50, tokens 110. e2e 119/119 on a fresh
  database. Audit clean in both themes, every surface, every width.

  **Still blocked, and not mine:** 5.7 media (gate 1), 9.5 the pre-order funnel
  (A-1), a contribution margin (A-2).

- 2026-09-15 — **§5.7.1–5.7.5a and 5.7.7: a house can photograph its perfume, and
  the shop shows it.** Browsers upload straight to storage on a signed URL; the
  server reads the bytes that ARRIVED (type, size, dimensions) before a row exists.
  Five new browser tests, including a real 1000×1250 upload through to the shop.

  Three things found on the way, all fixed:

  * **Every page was a 500 in development.** The startup guard imported Node-only
    modules at the top of `instrumentation.ts`, which Next also compiles for the
    edge. An early `return` before a dynamic import was eliminated by `next build`
    and NOT by `next dev` — so the build passed while the dev server served
    nothing. The only shape both remove is the import inside
    `if (NEXT_RUNTIME === 'nodejs')`, with the checks in `instrumentation-node.ts`.
  * **The light theme failed on seven status pills** (`bg-accent/15 text-accent`,
    4.08:1). One outlined `statusPill`, the same fix on four other tinted grounds,
    and `text-ink/90` on the home page. `tint.test.ts` refuses both forms in
    source — and its first version passed a planted offence, because it checked
    literals with their quotes on. Proved failing, then fixed.
  * `pnpm audit` from `apps/web` is pnpm's vulnerability report, not the
    accessibility audit — which is how 12 advisories surfaced. Now §10. The audit
    script refuses to start without `DEV_LOG`.

  e2e 124/124 on a fresh database. Audit clean in both themes, every surface,
  every width. Tokens 123.
