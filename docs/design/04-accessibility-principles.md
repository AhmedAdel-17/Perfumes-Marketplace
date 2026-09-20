# Accessibility principles

Doc 04 §5 requires keyboard use, contrast, labels, readable content and image alternative
text. The codebase already audits WCAG 2.1 AA with axe, 44 pt targets, RTL fill edges,
focus rings and heading order at six widths in both themes (FACT). These principles keep
that standard as the product grows.

1. **Floor, not aspiration.** 4.5:1 for all text; contrast asserted in tests for every ink
   on every surface role, both themes (FACT). Never a grey past the documented floors.
2. **44 pt everywhere.** Visual size may be smaller; the hit area may not (FACT `.tappable`).
3. **Keyboard for every flow.** Buy, check out, confirm an order, moderate, approve a
   payout — all reachable and operable without a pointer; no positive `tabindex` (FACT
   test).
4. **Visible focus.** 2 px accent ring, 2 px offset (FACT).
5. **Never colour alone.** Status has a word; meters have labels; the family colour is
   never the only carrier of meaning.
6. **Alt text is content.** Required on every product image (FACT publish gate); house
   marks carry the house name.
7. **Arabic that reads.** Correct leading, six-form plurals, digits per rule, bidi
   isolation for Latin runs (FACT).
8. **Motion is optional.** `prefers-reduced-motion` honoured globally (FACT).
9. **Forms explain.** Every error names the field and the fix in Arabic; all errors at once
   (FACT); labels above inputs.
10. **Announce outcomes.** Inline outcomes use `aria-live`; no toasts.
11. **Scroll regions are reachable.** Wide tables are focusable named regions (FACT).
12. **Screen-reader pass per release** on checkout and the seller queue (new).

Accessibility is audited per screen before "done", not in a later QA pass (CLAUDE.md §14).
