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

## 3. QA, as a senior QA engineer  ⬜

- [ ] 3.1 End-to-end journeys in a real browser (Playwright), buyer + seller + ops
- [ ] 3.2 Every interactive control exercised, including disabled and error paths
- [ ] 3.3 Boundary and adversarial input on every form
- [ ] 3.4 Accessibility audit (axe), keyboard-only traversal
- [ ] 3.5 Concurrency: double-submit, two tabs, stale session, stale cart
- [ ] 3.6 Money: every arithmetic path reconciles, no float, no rounding drift
- [ ] 3.7 Security: authorisation matrix per role, RLS proven per table
- [ ] 3.8 Fix everything found, re-run, record what was found and why it was missed

## 4. CMS  ⬜

Then continue the roadmap phase by phase.

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
