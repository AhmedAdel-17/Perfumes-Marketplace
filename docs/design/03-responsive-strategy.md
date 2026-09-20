# Responsive strategy

## 1. The rule (FACT, doctrine §4b)

A surface is not done until measured at **390, 768 and 1440**. Phone is the design origin;
tablet is a capped, centred column; desktop is a **different composition** (type ramp
changes, content gets columns, pinned things unpin). The audit script already checks six
widths in both themes.

## 2. Customer surfaces

| Surface | 390 | 768 | ≥1024/1440 |
|---|---|---|---|
| Home | one object, stacked entry rows, 2-col grid | capped column, 3-col grid | composed hero (object start edge, type end edge), rails, 4-col grid |
| Search | filter sheet with count; results first | filters as top chips; 3-col | filters in end-side column (280 px); results start at top; 4-col |
| Product | gallery, then buy block, then trust row, then content | capped | 7/5 split, media sticky; trust row under price |
| Compare | horizontal scroll table, sticky first column | same | full table |
| Cart | stacked shipment groups; total bar pinned | capped | two columns, sticky summary |
| Checkout | three steps; persistent total bar | capped, one page | form + sticky summary |
| Tracking | timeline per house stacked | capped | two columns: timeline · actions |
| House | banner, mark, story, grid 2-col | 3-col | composed header, 4-col |

## 3. Seller and operations surfaces

| Surface | 390 | ≥1024 |
|---|---|---|
| Queue | row cards with the deadline first; decision bar sticky | table; expand row; decision bar inline |
| Listing editor | single column; gaps panel as sheet | two columns; sticky gaps panel |
| Ledger / statement | stacked entries | table with totals row |
| Ops today / orders | list; actions in sheet | table; detail drawer end-side |
| Insights | stat cards stacked; tables scroll (named region, keyboard-reachable — FACT) | grid of stats; tables full |

Operating tools are used on phones by houses (the queue) and on monitors by operators; both
must be first-class, but the queue is designed phone-first and the console desktop-first.

## 4. Mobile-network reality (doc 04 §5)

Measured on throttled 3G: LCP < 2.5 s on product and search; three font files (FACT);
images sized per surface; skeletons to avoid layout shift; no client-side data library.

## 5. Breakpoint policy

`lg` (1024) is the structural breakpoint; `phoneMax` (440) caps the phone column below it.
A new breakpoint needs a stated reason ("what becomes possible at this width").
