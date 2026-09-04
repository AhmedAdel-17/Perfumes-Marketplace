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

## 2. Front-end review and polish, as a senior front-end engineer  ⬜

Every surface, judged for deployment readiness. One pass per screen, then a whole-product pass.

- [ ] 2.1 Home
- [ ] 2.2 Product
- [ ] 2.3 Cart
- [ ] 2.4 Checkout
- [ ] 2.5 Order confirmation + tracking
- [ ] 2.6 Seller sign-in, queue, payouts
- [ ] 2.7 Ops sign-in, queue
- [ ] 2.8 Cross-cutting: focus states, keyboard paths, screen-reader labels, empty/loading/error
      states on every surface, 360/390/768/1024/1280/1440, reduced motion, print
- [ ] 2.9 Performance: bundle, fonts, layout shift, above-the-fold weight

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
- 2026-09-04 — §1 done. Also found: both sign-in forms swallowed exceptions and left the
  button permanently disabled with no message; the product page put a time-series chart in the
  narrowest column on the page while its detail column ran 4x the height of the media beside it.
  Both fixed. 416 tests green.
