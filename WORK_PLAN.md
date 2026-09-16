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
- [x] 3.9 **Second pass, 16 Sep 2026** — the system roughly doubled after the first
      report (search, house pages, light mode, aftercare, the audit trail, the owner's
      screen, photographs, editorial images, the browsing funnel, a dependency upgrade)
      and none of it had been walked by hand. Five defects, each fixed in the same
      pass: one promise told two ways (the product page quoted a delivery a day
      earlier than the bag, checkout and confirmation of the same purchase); a
      published privacy page promising a retention the code did not keep; a publish
      gate admitting an image the shop refuses to render; no favicon at all; and
      `٣ مرّة` on the owner's screen — the plural bug the i18n package exists to
      prevent, in code written the day before

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

Doc 04 §8 lists eight acceptance gates for the MVP. **Seven are met** (16 Sep
2026). The eighth is not engineering's to close: it waits on counsel, and
building to a guess at what counsel will say is worse than waiting.

| Gate (doc 04 §8) | State (updated 15 September 2026) |
|---|---|
| Seller approved, publishes a product, receives an attributed order, sees a statement | ✅ — since 5.7: a house uploads a verified photograph, the listing publishes, and the shop and the bag show it. Production storage needs the R2 bucket and its CORS rule (README, "Deploying") |
| Customer understands shipping and completes COD checkout | ✅ |
| Split order produces correct seller tasks and customer tracking | ✅ — and since 0020, a dispatch deadline per house |
| Cancelled, refused, returned, failed-payment states reconcile | ✅ — returns requested, decided and refunded through screens; refunds audited |
| Only delivered orders create verified-purchase reviews | ✅ — enforced in the domain, the router and a database trigger |
| Admin actions, fee changes and payout adjustments are auditable | ✅ — written in the decision's own transaction; readable at `/ops/audit` |
| Privacy, terms, seller agreement, return policy, prohibited products | **partial — the only gate still open** — pages published through the CMS, prohibited-claim controls live; **pending counsel** on the wording, on the PDPL export/delete process before it may be built, and now on A-1's two 180-day retention figures, which are built to but not settled |
| Owner sees funnel, seller SLA and contribution without database work | ✅ — `/ops/insights`, both halves of the funnel since 9.5. A contribution margin still waits on A-2 (payment and courier costs), and the screen shows each input's status rather than a margin computed from half its terms |

## 5. The seller's catalogue  ✅

The largest remaining gap, and the one everything else waits on: today every
product in the system was seeded by hand. A marketplace where the platform
enters the catalogue is not a marketplace.

- [x] 5.1 Listing lifecycle — draft → pending_moderation → published ⇄ suspended
- [x] 5.2 The listing form — 24 fields in 6 groups, gaps counted while writing
- [x] 5.3 Platform moderation queue with coded reasons and a waiting clock
- [x] 5.4 Prohibited-claim controls: refused outright, or flagged for a person
- [x] 5.5 Stock and price editable on a live listing (the audit trail is §6)
- [x] 5.6 Domain tests, database guards, 19 surfaces in the audit
- [x] 5.7 **Media — done 16 Sep 2026 (M-1: Cloudflare R2).** A listing cannot
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
      - [x] 5.7.6 The CMS image block renders from the same store — an operator
            uploads, the server verifies (`content_images`, 0022), and a page with
            an unverified key cannot publish. The "image key" text field is gone
      - [x] 5.7.7 Contract tests on both adapters, e2e, audit in both themes

## 6. The audit trail  ✅
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

## 9. What the owner can see  ✅
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
- [x] 9.5 Pre-order funnel — **done 16 Sep 2026 (A-1).** First-party events under an
      anonymous id, no third-party script, and no personal data: migration 0023's
      insert-only `analytics` role refuses a customer id, a payload (so a search is
      counted and its words are not), a source, a campaign and an order. Seven events
      from the shop; the owner's screen counts VISITORS and events per stage.
      Retention is a purge function — 180 days, proposed to counsel, unscheduled
      (DEBT #5)

## 10. Dependency security  ✅
`pnpm audit` on 15 Sep 2026: 12 advisories (1 critical, 4 high). None was reachable in
the way its advisory describes, and none was left open on that argument. Zero on
16 Sep 2026.

- [x] 10.1 `drizzle-orm` 0.38 → 0.45.2 (high: identifiers not escaped in `sql.identifier`
      / `sql.as`), with `drizzle-kit` 0.30 → 0.31.10. Runtime dependency — first.
      **It broke something:** 0.45 wraps a driver error in `DrizzleQueryError`, so the
      one router that reads what the DATABASE said stopped matching and an explained
      refusal became "something went wrong". Fixed with `errorMessages` (the whole
      `cause` chain); the test that missed it now asserts the sentence
- [x] 10.2 `vitest` 2 → 4.1.11 across the six manifests; brings patched `vite` and
      `esbuild` (critical: the Vitest UI server — not installed here — and the dev
      server's path and origin checks). Development only. No config change needed
- [x] 10.3 `postcss` ≥8.5.23 under Next, by a pnpm override in `pnpm-workspace.yaml`:
      Next's newest 15.x (15.5.25) still pins 8.4.31, and Next 16 is its own
      migration. A second override followed — `@esbuild-kit/core-utils>esbuild`,
      drizzle-kit's deprecated loader — visible only once 10.2 removed the other
      esbuild paths. Both are parent-scoped and say when they may be removed
- [x] 10.4 `pnpm audit:deps` (root script, `--audit-level=moderate`) and README
      "Dependency advisories". **Not** in `pnpm test`: it asks the registry, and a
      test that fails an unchanged commit overnight is a test people learn to skip

---

## 11. Mobile — the ground the apps stand on

Two Expo apps have been the plan since TECH_STACK §1: separate store listings,
sharing `packages/*`, never sharing an app. The folder layout in ARCHITECTURE §3
is founder-specified and normative — extended, never rearranged.

**What does not exist is anything for them to talk to.** Every call in this
system today is `appRouter.createCaller(ctx)` inside the web server's own
process. There is no `apps/web/src/app/api` directory at all. A native app
cannot call a function in someone else's process, so the first phases here are
not scaffolding — they are the boundary, and the two debts that boundary makes
undeferrable.

The order is forced, not chosen: no screen is worth writing before sign-in
survives a restart, and sign-in's codes are DEBT #1.

- [x] 11.1 **The HTTP boundary — done 16 Sep 2026.** `/api/trpc/[trpc]` on the
      fetch adapter (@trpc/server 11.18 ships `./adapters/fetch`). `core/api.ts`
      split into `apiContext()` and `api()` so the in-process caller and the wire
      share ONE composition root — the alternative is a second place where "who
      is calling" is decided, which is the same class of defect as QA #14. The
      policy and preflight live in `packages/api/src/http.ts`, testable without
      booting Next; the route is composition and nothing else.

      Two decisions worth keeping:

      **A stranger is refused BEFORE the router runs.** Ordinary CORS runs the
      work and then withholds the headers so the browser will not let a script
      read the reply — which protects the answer and not the write. This returns
      403 before any context is built. The test proves it with a counter on the
      context factory, and a CONTROL test sends the same request with that origin
      allowlisted to show the counter would otherwise move: absence of evidence
      is only evidence when the instrument is known to work.

      **Anonymous only, deliberately, until 11.3.** Both session resolvers exist
      and are revocation-aware, and neither is wired to this route. Nothing needs
      it — the web app reaches the router in-process, and the buyer app's whole
      first surface is anonymous by design, guest checkout included (D-2). A
      cookie here would be a forgery surface with no caller; `Allow-Credentials`
      is never sent, so cross-site forgery is impossible by construction rather
      than mitigated. The apps present a bearer token in 11.3 and the change is
      one line.

      14 tests over the boundary, API suite 274 → 287, both typechecks clean, and
      a real perfume fetched over real HTTP from the running app.

      *Not proven:* the mutation check on two of the three new rules. Breaking
      `http.ts` on purpose was refused by the permission classifier — correctly,
      since such an edit is indistinguishable from disabling a security check.
      The origin rule was falsified by inverting the INPUT instead of the code.
      The credentials and `Vary` assertions have not been shown able to fail.
- [x] 11.2 **One-time codes that survive a restart — done 16 Sep 2026, pays the
      STORE half of DEBT #1.** Migration 0025 `login_codes`: a digest, never the
      code; expiry; attempt count; single use — the exact semantics the
      in-process Map had (five minutes, five attempts, counted BEFORE the
      comparison, deleted on success), now shared by every instance. The debt's
      condition still holds: the store and the SMS sender must be replaced
      together, and the sender is still a stub, so sign-in still cannot go live.
      What changed is that only the sender is left.

      **The design moved once, under evidence.** The first attempt was RLS
      policies plus plain SQL, and Postgres refused it: with no SELECT policy —
      the whole point, since a path that can read one pending code can enumerate
      them all — `INSERT … ON CONFLICT DO UPDATE` cannot read the row it would
      update, and UPDATE and DELETE match nothing because they cannot find rows
      either. A diagnostic proved it rather than a guess: plain INSERT passed,
      both upsert paths failed, DELETE silently affected zero rows. Adding a
      SELECT policy would have made all three work and given away the guarantee.

      So `login_codes` has RLS forced and **no policies at all**, and its three
      operations are `SECURITY DEFINER` functions each guarded on the actor GUC:
      `app.issue_login_code`, `app.verify_login_code`,
      `app.purge_expired_login_codes`. Verification is one locked statement, so
      the attempt ceiling holds under concurrent guessing rather than being an
      application convention. Expiry comes from the database's clock, so a
      skewed container cannot extend a code — the port takes no `expiresAt`,
      because a parameter the implementation ignores is a lie in the interface.

      `policy-shape.test.ts`'s two invariants now carry an exemption for it, in
      the shape that file already demanded of the migration ledger: a proof
      block, not a name on a list — no policies, all three functions definer,
      all three refusing a non-`identity` actor. A fifth service role,
      `identity`, joins the closed `ActorContext` union.

      41 tests over the rules, run against the in-memory double AND Postgres so
      neither is trusted alone; db suite 347 → 351; API and db typechecks clean.
      `drizzle-orm` moved from devDependencies to dependencies — it is imported
      at runtime now, and a runtime import resolved through a dev-only
      dependency is a clean-install failure waiting to happen.

      *Still to wire:* both sign-in paths still call the in-process `issueCode` /
      `verifyCode`. The store exists and is proved; 11.3 replaces the callers
      when it adds bearer tokens, because the two touch the same two files.
- [ ] 11.3 **Identity for a native client.** A browser has cookies; an app has a
      keychain. Bearer tokens signed with the same HMAC discipline as the session
      cookie — short-lived access, refresh with server-side revocation, held in
      Expo SecureStore, never in Redux and never in MMKV. The per-request
      revocation check the web already does (`activeSellerSession`) applies
      identically, because revocation that takes effect "eventually" is not
      revocation.
- [ ] 11.4 **Rate limits that count once — pays DEBT #2.** Migration 0026
      `rate_limit_windows` behind the existing `consume()` interface, so no call
      site changes. Forced by 11.1: a counter in one process, in front of a
      public HTTP API, is a counter per container and a limit multiplied by the
      number of them.
- [ ] 11.5 **The native design system.** `@diyar/tokens/native` already exists
      and is unused; `packages/ui` is icons and nothing else. Native primitives
      beside the web ones under one token source, NativeWind wired to the same
      scale, and RTL forced at first launch — `I18nManager.forceRTL` needs an app
      restart to take effect and is a documented source of bugs (TECH_STACK §10).

## 12. The buyer app

Guest-first, exactly as the web is: D-2 is still open and `customers.claimed_at`
exists so a guest order can be claimed later. Nothing here invents an account
policy — that decision is the founder's.

- [ ] 12.1 `apps/buyer-app` — Expo in the normative layout, typed config, the
      tRPC client as the ONLY network access (ARCHITECTURE §3.1)
- [ ] 12.2 Discovery: home, search, house pages
- [ ] 12.3 The perfume: photographs, notes, the delivery promise from
      `arrivalWindow` — one formula, the QA #14 rule
- [ ] 12.4 Bag and checkout, cash on delivery, the same quote the web shows
- [ ] 12.5 Orders and tracking by phone, the aftercare paths
- [ ] 12.6 Push notifications: dispatched, out for delivery, delivered

## 13. The seller app

The house's phone is where its work actually happens — a queue with a clock on
it belongs in a pocket, not on a desk.

- [ ] 13.1 `apps/seller-app` — same layout, sign-in on 11.2/11.3
- [ ] 13.2 The queue, with the dispatch deadline from 0020
- [ ] 13.3 Confirm, dispatch, decline — the same three decisions, same refusals
- [ ] 13.4 Listings and photographs from the camera, through the same verified
      upload the web uses (5.7) and the same publish gate (0024)
- [ ] 13.5 Returns and payouts
- [ ] 13.6 Push: a new order, and a deadline about to pass

## 14. Launch hardening — the rest of the technical scope

- [ ] 14.1 DEBT #3 — a house's contact columns readable by anonymous traffic
- [ ] 14.2 DEBT #4 — the sweep for photographs whose file outlived its row
- [ ] 14.3 DEBT #5 — schedule `app.purge_analytics_events`; payout runs, courier
      polling and 14.2 all want the same scheduler, so it is built once
- [ ] 14.4 Device tests (Maestro) on both apps
- [ ] 14.5 EAS build configuration, icons, splash, store metadata. Submission
      itself waits on Apple organization enrolment — founder, D-U-N-S, 2–6 weeks

Then the roadmap's Phase 2.

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
  (A-1), a contribution margin (A-2). *(Superseded: M-1 and A-1 were decided on
  15 Sep; see the entries below.)*

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

- 2026-09-16 — **§5.7 done, and with it §5 and MVP gate 1.** Two slices since the
  last entry.

  **5.7.5b, the bag** (commit efe6a89). The cart snapshot carries the verified
  primary photograph as a key, read in the same query as the price; the API makes
  it a URL. A contract case follows a change of primary, and breaking the primary
  condition in either adapter fails it.

  **5.7.6, editorial images.** The image block was a text field that saved any
  key an operator typed — a key to nothing drew a placeholder on the public site,
  and a key to a house's photograph would have published that photograph on a
  page nobody reviewed it for. Now:

  * `content_images` (0022): a row only for bytes the server read. Keys are
    CHECKed to `content/{page}/…`; every fact NOT NULL. A visitor reads a row only
    while a live page's SERVED revision names it — not a draft's upload, not an
    old revision's, not an archived page's. 14 cases prove each clause.
  * `objectionsToPublishing` now REQUIRES the verified keys. Optional would have
    made "forgot to look them up" read as "no images", and the first caller to
    forget would publish a typed key. A router mutation that treats every named
    key as verified fails the API test.
  * The file checks behind both uploads are one function (`image-verification.ts`),
    and the browser side one module (`features/media/upload.ts`); the photograph
    manager uses both rather than keeping its own copies.
  * Saving a draft no longer demands an image key, which had made any page with a
    new image block unsaveable. Publishing is where a key is judged.
  * `next.config.mjs` allows `/content/**` from the media origin as well as
    `/products/**` — invisible in development, fatal in production if missed.
  * DEBT #4 widened: editorial images are never deleted, because immutable
    revisions may still name them.

  Domain 647, db 323, api 268, tokens 123. e2e 125/125 on a fresh database,
  including an operator uploading an image and a visitor seeing it through the
  optimiser. Audit clean in both themes, every surface, every width.

  **Next: §10**, the dependency advisories — drizzle-orm first.

- 2026-09-16 — **§10 done: `pnpm audit` is clean, 12 advisories to zero.**
  drizzle-orm 0.38 → 0.45.2 with drizzle-kit 0.31.10, vitest 2 → 4.1.11 across
  six manifests, and two parent-scoped overrides in `pnpm-workspace.yaml`
  (Next's postcss, drizzle-kit's esbuild).

  **The upgrade broke a message, and the test did not notice.** drizzle-orm 0.45
  wraps a driver error in `DrizzleQueryError`; `applications.setStatus` matched
  the trigger's words against `error.message`, which is now "Failed query: …"
  with the real text under `cause`. So an operator trying to make an unvetted
  house live was told "حدث خطأ" instead of how many controls still fail — on the
  one screen where the reason is the point. The test asserted `.rejects.toThrow()`
  and passed either way. `errorMessages` now walks the cause chain, the test
  asserts the sentence, and undoing the fix fails it with the exact wrong text.

  **Two mistakes of mine, both worth keeping:**

  * I reported "0 advisories" while one remained. The summary script counted
    `advisories` in `pnpm audit --json` and read an empty response as zero — the
    same "passes by finding nothing" flaw the tint guard had. `audit:deps` uses
    pnpm's EXIT CODE instead, and that is what found the last one.
  * `pnpm exec drizzle-kit --help` installed the pending esbuild override while
    the browser suite was running: in pnpm 11 every pnpm command runs the
    dependency check first. The suite still passed 125/125 (the site does not use
    esbuild at runtime), but the hazard is in the README now.

  Domain 647, i18n 50, tokens 123, db 323, api 268. e2e 125/125 on a fresh
  database, with ZERO "unhandled error" lines in the server log — which is the
  fix above, proved through the real stack. Audit clean in both themes, every
  surface, every width. Production build passes.

  **Next: §9.5**, the pre-order funnel (A-1 approved): first-party events under
  an anonymous id, no personal data, no third-party script.

- 2026-09-16 — **§9.5 done, and with it §9.** `analytics_events` had existed since
  0000 with nothing ever writing to it, so "who looked at a perfume and did not
  buy" had no answer at all.

  **The privacy rules are a policy, not a promise.** Migration 0023 adds an
  insert-only `analytics` service role — the fourth, and the narrowest: it may
  append an event and may not read the table back. Its WITH CHECK refuses a
  customer id, a payload, a source, a campaign and an order id, so **a search is
  counted and the words are not** — the search box is exactly where somebody
  types a name or a phone number. The domain draft type has no field for any of
  them either, and 0023 refuses an event name outside the seven the shop fires.

  **Identity** is 24 random hex characters in an `httpOnly`, 180-day first-party
  cookie, set from a server action because Next refuses a cookie written while
  rendering. **Retention** is `app.purge_analytics_events` — written, tested, and
  scheduled by nothing (DEBT #5). Both 180-day figures are the proposal in A-1,
  awaiting counsel.

  **Counted two ways.** The owner's screen shows VISITORS and events per stage:
  one person refreshing a perfume page twenty times is one visitor who looked,
  and a rate built on events would call them twenty people who did not buy. No
  browse-to-order conversion is shown: stages count visitors and the post-order
  funnel counts sub-orders, so the ratio would have a different unit on each
  side. That needs the anonymous id on the order, which A-1 did not decide.

  **Two of my own mistakes, both caught by the checks rather than by luck:**

  * Making `browsing` required on the report input without passing it in the test
    helper — every owner-metrics test failed at once, which is what a required
    field should do.
  * `preOrder` computed, typed, and left out of the returned object. Every test
    passed; `report.preOrder` would have been undefined on the screen. The
    typecheck caught it, and there is now a report-level test for the wiring.

  Domain 677, db 347, api 274, i18n 50, tokens 123. e2e 126/126 on a fresh
  database, including an anonymous visitor's view and bag-add read back from the
  operator's own screen. Audit clean in both themes, every surface, every width.

  **Next:** the roadmap's Phase 2 and the mobile apps. Still the founder's:
  A-2 (payment and courier costs, deferred to pre-deployment), A-3 (costing a
  support ticket), S-1's support-inbox question, and the legal items — a real SMS
  provider, D-5, and counsel on the A-1 retention figures.
