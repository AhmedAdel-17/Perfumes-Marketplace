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

| Gate (doc 04 §8) | State |
|---|---|
| Seller approved, publishes a product, receives an attributed order, sees a statement | **partial** — orders, attribution and statements work; a house cannot list a product |
| Customer understands shipping and completes COD checkout | ✅ |
| Split order produces correct seller tasks and customer tracking | ✅ |
| Cancelled, refused, returned, failed-payment states reconcile | **partial** — the machine is complete and tested; refused and returned have no screen |
| Only delivered orders create verified-purchase reviews | **not started** |
| Admin actions, fee changes and payout adjustments are auditable | **partial** — the table exists; nothing writes to it |
| Privacy, terms, seller agreement, return policy, prohibited products | **partial** — the CMS can carry them; the prohibited-product control does not exist |
| Owner sees funnel, seller SLA and contribution without database work | **not started** |

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
- [ ] 5.7 **BLOCKED — media.** A listing cannot publish without a primary image
      whose ownership is confirmed, and there is no way for a house to add one.
      Needs a storage decision (provider, cost, signed uploads) before it can be
      built. This is the last thing standing between the platform and MVP gate 1.

## 6. The audit trail  ◐
- [x] 6.1 The port, both adapters, and a field-level diff
- [x] 6.2 Written by the decisions doc 04 §8 names — listing moderation, payout
      approval, remittance, policy publishing — inside the same transaction
- [x] 6.3 Proved from both sides: an entry exists after a decision, and a FAILED
      decision leaves none behind
- [ ] 6.4 A console screen to read it without SQL (the second half of gate 6)

## 7. Reviews  ⬜
Verified purchase only, from delivered orders (gate 5).

## 8. Refused and returned  ⬜
The state machine handles them; no screen does (gate 4).

## 9. What the owner can see  ⬜
Funnel, seller SLA, contribution inputs — without touching the database (gate 8).

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
