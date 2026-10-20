# Design Doctrine

**Founder directive, 1 September 2026:** the reference standard is Dior, Saint Laurent and
Xerjoff. This is not a styling preference — it is the product. A perfume marketplace that
feels ordinary has already failed, because the entire category sells on desire.

This document turns that into rules an engineer can apply and a reviewer can check.

> **Visual identity v2 — 14 October 2026 (founder decision FD-1, `DECISION_REGISTER.md`).**
> The founder judged the first identity "cheap, not optimised, AI-generated" and chose from
> four rendered samples (`design-reference/redesign/`). The product now has **two finishes
> over one layout**: LIGHT "Laboratoire" (`04-laboratoire.html`), the default — putty and
> paper, sepia ink, one olive accent, every perfume shown as a specimen with its facts and
> their source; and DARK "Noir" (`02-noir-absolu.html`) — black and bone, no colour accent,
> condensed type. The layout is sample 4's in both. The seven laws stand; laws III and IV,
> the imagery rule and §7 are amended below, each with its date. Older references in
> `/design-reference` still define structure where the redesign has not reached a screen yet,
> but never colour, type or finish.

Read with `ENGINEERING_PRINCIPLES.md`. The existing design references in
`/design-reference` and the tokens in `src/tokens.json` are the concrete expression of
everything below.

---

## 1. The seven laws

### I. Luxury is subtraction

Remove until removing hurts, then stop. Every element on screen must justify its existence.
A screen with four things done perfectly beats a screen with twelve things done well. When
in doubt, delete it.

### II. Space is the material

Negative space is not empty — it is the single strongest signal of value. Mass-market apps
maximise density because they monetise attention. We do the opposite. Fewer products per
row. More air around everything. A cramped grid says "discount"; a spacious one says
"considered."

### III. Typography carries the brand

**Amended 14 October 2026 (identity v2), and again 16 October 2026: the two themes differ
in colour only.** Noir is Laboratoire with the lights off — same faces, weights, layout and
finish. Faces follow the language, never the theme:

| | Both themes |
|---|---|
| Arabic headings | Noto Naskh Arabic |
| Arabic text | IBM Plex Sans Arabic |
| English headings | Newsreader (italic for the accent phrase) |
| English text | IBM Plex Sans Arabic (its Latin glyphs) |
| Latin labels and data | IBM Plex Mono |

A component never names a family: it says `font-display`, `font-sans` or `latin`, and
`globals.css` decides. Set the Arabic scale first — Arabic needs more leading than Latin,
and every app that sets Latin first produces cramped, amateur Arabic.

Letterspacing is not decoration — and it is **Latin only**. A tracked Latin label is the
difference between a fashion house and a storefront template; tracked Arabic is broken
Arabic, because spacing pulls the joined letters apart. Arabic is never letterspaced,
uppercased, or set in the label face. *(Was: Amiri headings, Bodoni Moda labels.)*

### IV. One accent, and use it sparingly

**Amended 14 October 2026 (identity v2).** Laboratoire: putty, paper, sepia ink — and
**olive**, the one accent. Noir: black, bone, greys — and **no colour accent at all**; the
accent role is bone, so emphasis comes from weight, scale and the photograph. Each theme
still has exactly one accent (or none). The original wording follows as history.

*Original:* Noir, bone, and brass. That is the palette. Brass is for moments — a price, an accent rule,
a single active state. The instant a second accent colour appears, the impression collapses.
Scent-family and note-tier colours exist for data visualisation only and never for chrome.

**Amended 7 September 2026 — the same three, in two directions.** The product now offers a
light theme (§7). This does not add a colour: paper, graphite and bronze are ground, ink and
accent restated for a lit page. The law is unchanged and the count is unchanged. What changed
is that a component may no longer *name* a colour — it names the JOB, and the theme decides
the value. See §7.

### V. Sharp, not soft

`radius: 0–3px`. Nothing is rounded into friendliness. Rounded corners and soft shadows read
as approachable and mass-market; hairlines and right angles read as precise and expensive.
Separation comes from a 1px hairline and a shift in value — **almost never from a shadow.**

### VI. Motion has weight

Things settle. They never pop, bounce, or spring. Slow, eased, deliberate — 400–700ms with a
custom ease-out, not the framework default. A bouncy spring animation instantly reads as a
consumer app. Motion should feel like a heavy, well-made drawer closing.

### VII. Never shout

No "SALE!" No countdown timers. No "only 2 left!" No red urgency banners. No exclamation
marks. No emoji in the interface. A discount is stated quietly, in the same voice as
everything else. Urgency is a discount-retail tactic and it is forbidden here.

---

## 2. What this means in code

### Tokens to add

`src/tokens.json` currently has no motion, opacity or haptic scale. It needs them before any
screen is built, because these are exactly the values that get improvised inconsistently:

```jsonc
"motion": {
  "instant": 120,       // state change only — press feedback
  "quick": 240,         // small reveals
  "base": 420,          // default transition
  "slow": 640,          // screen transitions, hero reveals
  "ceremony": 1600,     // once-per-visit arrivals only (added 17 Oct 2026)
  "mist": 2400,         // the masthead's spritz, once per visit
  "$rule": "Nothing under 120ms. Nothing bouncy. Ever. Nothing a click answers is slower than slow."
},
"easing": {
  "out":     "cubic-bezier(0.16, 1, 0.3, 1)",     // default — decisive, settles
  "inOut":   "cubic-bezier(0.65, 0, 0.35, 1)",    // symmetric moves
  "entrance":"cubic-bezier(0.22, 1, 0.36, 1)",
  "$forbidden": "No spring, no overshoot, no ease-in-back."
},
"opacity": { "veil": 0.44, "scrim": 0.72, "disabled": 0.38, "press": 0.62 },
"haptic":  { "select": "light", "confirm": "medium", "error": "warning" }
```

### Elevation

There is no elevation scale, and that is deliberate. Depth comes from **value** (`l1 → l2 →
l3`) and **hairlines** (`hair`), not from shadows. A drop shadow requires written
justification.

### Every interactive element defines five states

Rest · press · focus · disabled · loading. Not four. A component without a designed press
state is unfinished — and on mobile, press feedback is the single most-felt detail in the
entire app.

### Every list and data surface defines five states

Loading · empty · error · offline · end-of-list. Empty states are **designed**, never blank
and never a bare sentence. The empty wishlist is a brand moment, not an error.

### Loading

**No spinners.** Skeletons that match the final layout exactly — same dimensions, same
spacing — so content arrives without the page moving. Images fade in over `motion.base`;
they never snap. Layout shift is a defect, not a nuisance.

### Imagery

*Amended 14 October 2026 (identity v2):* product photographs sit on the theme's own plate —
paper in Laboratoire, near-black in Noir — and are **always in full colour**: a customer must
see the colour of the juice, and a phone has no hover to reveal it. Black-and-white is a Noir
treatment for hero and editorial imagery only. The dark "stage" survives only behind the
illustrated flacon, the placeholder for a listing with no photograph.

*Original:* Photography is the product. Full-bleed, dark, art-directed. Never a white-background cutout
dropped on a grid. Enforced minimum resolution; **never upscale**. Blur-up placeholders in
brand tones, not grey boxes. Fixed aspect ratios per surface, held everywhere.

### Numbers and prices

Tabular figures so prices align in a column. One decision on Arabic-Indic (`٤٥٠`) versus
Western (`450`) digits, applied everywhere without exception. Currency rendered as a
letterspaced Latin label, never as a bare glyph jammed against the number.

### Arabic typography — where most Egyptian apps fail

Correct leading (`lineHeight` set for Arabic first). No squashed diacritics. No forced
uppercase on Arabic — it does not exist. Latin runs inside Arabic text isolated with
`unicode-bidi: isolate` so bidi never scrambles a product name. Test every screen with
`عطر Cozy بسعر ٤٥٠ جنيه`.

### Custom components only

No default platform button, switch, picker or alert anywhere in the product. A stock iOS
alert in the middle of a bespoke experience destroys the illusion instantly. Everything
comes from `design-system/primitives/`.

---

## 3. Instant-death list

Any one of these, anywhere, breaks the impression:

- Drop shadows used as the default separator
- Rounded pill buttons with gradients
- A second accent colour
- Bouncy or springy animation
- Emoji in the interface
- Toast notifications for routine actions
- Stock photography
- `HOT` / `NEW` / `-50%` badges
- Exclamation marks in copy
- Inconsistent icon stroke weights (ours is `1.3`, everywhere, always)
- Inconsistent corner radius across two components
- A grey darker than `#B1A89C` on Noir, or lighter than `#67615A` on Laboratoire's putty (§7; Noir's value since 17 Oct 2026)
- An alpha applied to an ink role — `text-accent/90` measures 4.08:1 on paper (§7)
- A calibrated ink on a translucent fill — `bg-accent/15 text-accent` also measures 4.08:1 on
  paper, and shipped as seven status pills because it clears the floor on noir. A status label
  is outlined (`statusPill`): its border may be translucent, its ground may not. Both this and
  the line above are refused in source by `packages/tokens/src/tint.test.ts`
- Any hardcoded colour, size or spacing value that bypasses the tokens

---

## 4. The detail checklist

Run per screen, before it is called done. This is what "take care of the small details"
means operationally.

- [ ] Every tap target measured at 44pt — measured, not eyeballed
- [ ] Press state present and felt on every interactive element
- [ ] Focus ring visible and correct (2px accent, 2px offset)
- [ ] Skeleton matches final layout dimensions exactly — zero layout shift
- [ ] Empty, error and offline states designed, not defaulted
- [ ] RTL correct with mixed Arabic/Latin content
- [ ] Directional icons flipped; logos and real-world objects **not** flipped
- [ ] Progress and intensity meters fill from the right — **asserted in a test, not eyeballed** (see the trap below)
- [ ] Contrast checked against `$contrastNotes`, not assumed
- [ ] Checked in BOTH themes — `THEME=light` for the audit as well as the default run
- [ ] Any panel that stays dark on paper carries `data-theme="dark"` AND restates `text-ink`
- [ ] Transitions use `motion` + `easing` tokens, never inline values
- [ ] `prefers-reduced-motion` honoured
- [ ] Renders correctly at 360px width
- [ ] Optical alignment checked by eye after mathematical alignment — they differ
- [ ] Haptic feedback appropriate and rare (mobile)
- [ ] Copy read aloud in Arabic — does it sound like a house, or like a shop?

---

## 4a. The `inset-inline-start` trap

Found the hard way on 1 September 2026, in four places across two files, *despite* the rule
above already existing. Worth its own section because it will recur in every RTL component.

**In RTL, `inset-inline-start` resolves to `right` and `inset-inline-end` resolves to `left`.**
This is the opposite of what the words feel like when you are reading English source code, and
the mistake is invisible until you measure — the layout still renders, it is just mirrored.

What it broke here: a timeline spine positioned 350px away from its own nodes, and three
progress meters filling from the wrong edge — violating a rule that was already written down.

**The lesson is not "be careful."** A checklist item did not catch this; a measurement did.
So for any absolutely-positioned or directional element:

```ts
// Assert the anchored edge, not the visual result.
expect(fill.right).toBeCloseTo(track.right)   // fills from the right in RTL
expect(spineCenterX).toBeCloseTo(nodeCenterX) // spine runs through its nodes
```

Anything that fills, slides, anchors, or draws a connector gets a geometry assertion. This is
`ENGINEERING_PRINCIPLES.md` §3 — *measured, not eyeballed* — applied to layout.

---

## 4b. The phone-first trap: a website is not a wide phone

Found on 3 September 2026, by the founder, on his own monitor — which is the worst way to find
anything. Every buyer surface had been drawn at 390px and shipped with `max-w-[420px]`, so on a
1440px screen the marketplace rendered as a phone-shaped column floating in black. It was not
broken; it was **unfinished, and nothing said so.**

The failure mode is specific and it is not laziness: mobile-first is correct, and a phone layout
that works is genuine progress. The trap is that a capped phone layout **looks finished at every
width**. There is no error, no overflow, no failing test — the page renders perfectly and is
perfectly wrong. Compare this with the RTL trap above: same shape of bug, same reason it survived
review, same fix.

**The law.** A surface is not done until it has been measured at three widths:

| Width | What it is | What must be true |
|---|---|---|
| **390** | the phone the design was drawn for | the reference design, exactly |
| **768** | tablet / small laptop | a capped, centred column — never a stretched phone |
| **1440** | the founder's monitor | a *composed* layout: columns, a real masthead, desktop type |

**Desktop is a different composition, not a scaled one.** Three things change, and if none of
them changed you did not do the work:

1. **The type ramp changes.** `fontSize.h1` is 33px — a phone headline. On a 27-inch monitor it
   reads as a screenshot of an app. The `Lg` steps exist for this and start at 1024.
2. **Content gets columns.** A single 1240px column of body text is a spreadsheet. The product
   page splits 7/5 with the media sticky; the grid goes 2 → 3 → 4.
3. **Pinned things unpin.** A bar welded to the bottom of a 900px-tall browser window is a phone
   habit. On desktop the same control sits inline, in the flow, where the eye already is.

**Breakpoints are a decision, not a default.** Structure changes at `lg` (1024) because that is
where two columns genuinely fit; type changes at `lg` too. Below that the page is the phone
design, capped at `phoneMax` and centred — a comfortable column on a tablet beats a 900px-wide
stretch of something drawn for 390px. Do not introduce a breakpoint without saying what becomes
possible at that width.

**And the meta-lesson, which matters more than the layout.** Verifying at one width and reporting
the surface as complete was the actual defect. "It renders" is not "it is finished." Widths are
now part of the Definition of Done for any visual surface, alongside the geometry assertions in
§4a — measured at 390, 768 and 1440, or not claimed.

---

## 4c. Arabic plurals: six forms, not two

`counted(n, PERFUME, editorial)` — never `${n} عطر`.

Arabic inflects a counted noun **six** ways (CLDR: zero, one, two, few, many, other), and the
categories depend on `n % 100`, so 103 behaves like 3 and 111 behaves like 11. Worse, `one`,
`two` and `zero` carry the count *inside the word* — عطران already means "two perfumes" — so
prefixing a numeral yields "٢ عطران", "two two-perfumes".

Shipped wrong once already: the home page read **"٣ عطر"**, which lands on a native reader
exactly the way "3 perfume" lands on an English one. This is the single most reliable tell that
a product was localised rather than authored, and no amount of typographic refinement above it
survives that one line.

`@diyar/i18n` → `plural.ts` owns every form. Add a noun there; never inflect at a call site.

---

## 4d. Why the first pass looked machine-made

The founder's verdict on the first build was: *very basic, AI generated, no sense of luxury.*
He was right, and the diagnosis is worth keeping because the fix was never "add more gold".

**1. The product was a rectangle with a gradient on it.** Everything else is downstream of
this. A flacon reads as glass because of four things — near-black edges where light crosses the
full thickness, a liquid line with empty glass above it, a caustic pool where the bottle focuses
light onto the surface, and a hard contact shadow. A single fill has none of them, and no amount
of typography above a plastic-looking object rescues the page. `Flacon.tsx` renders all four.

**2. There was no light in the scene.** A flat field of `#0B0A09` is not a dark room, it is an
absence. Every plate is now four layers — ambient ground, a warm key above and behind the
subject, the subject, then a vignette closing the corners. Collapse those into one gradient and
the panel goes flat again.

**3. No grain.** Nothing physical is a perfectly even field of colour. At 3.5% the grain is
invisible if you look for it, and without it large dark areas read as vinyl and wide gradients
band on 8-bit panels.

**4. The type was timid.** 33px is a phone headline. A maison opens at 72–108px.

**5. Nothing arrived.** Content that simply exists the instant the bytes land feels like an app.
A 700ms rise of twelve pixels on a decelerating curve is the entire effect.

**6. The wordmark was letterspaced Bodoni** — which is what every generated brand looks like.
A house has a *mark*: something drawn, legible at 16px in a tab, that means something.

**The generalisable rule.** Every one of these is a *placeholder that was never replaced*, and
placeholders are dangerous precisely because they render without error. A gradient rectangle
where a product should be does not fail a test, does not throw, does not overflow — it simply
looks like nothing was decided. Before calling a surface finished, ask of each element: was this
chosen, or is it merely the first thing that rendered?

---

## 5. Brand identity — still open

**Selected 1 September 2026: DIYAR — ديار.** "The houses" — plural of دار, the word the
interface already uses (٤٢ دار عطور). It names the business accurately: not a perfume brand,
but a collection of perfume houses. It also puts sellers in the name, which is *brand
independence* (doc 01 §6) expressed at the level of the mark itself.

Candidate exploration is preserved in `design-reference/names.html`.

**Still gated on screening.** No registry check has been performed. An Egyptian IP agent must
clear DIYAR in Trademark Office classes **3** (fragrance and cosmetics) and **35** (retail and
marketplace services) before store listings are submitted or stationery is printed. Register
the domain the week the search clears. Known dilution risk: DIYAR is widely used in Gulf real
estate — a different class, but it will affect search results.

**Lockup rules.** The name alone does not say "fragrance," so the wordmark takes a descriptor
in commercial contexts: `DIYAR · PARFUMS`. The Arabic ديار stands alone unaided.
The **device is name-independent and final** — and since the wordmark is illegible at store
icon size in every candidate tested, the app icon uses the device alone.

---

## 6. The standard to hold

> Would Dior ship this screen?

If the honest answer is "it's fine," it is not finished. Fine is the enemy. The category
sells on desire, and desire does not survive a misaligned hairline.


---

## 7. Two themes, one palette

> **Amended 14 October 2026 (identity v2).** Now *two themes, two palettes, one layout*:
> Laboratoire is the default and Noir the alternative (FD-1). The role mechanism below is
> unchanged and is what made the swap a token change rather than a rewrite. What no longer
> holds: "noir is the identity", "dark is the default", and "the product plate stays dark in
> both themes" — see the imagery rule in §2. The text below is kept as the record of why the
> mechanism exists.

**Added 7 September 2026, at the founder's request.** Noir is the identity; paper is an
option the visitor may take. Both are the house.

### The roles

A component names a job, never a value. `bg-ground`, `bg-raised`, `border-line`, `text-ink`,
`text-ink2`, `text-ink3`, `text-accent`, `bg-accent-surface`, `text-on-accent`, `text-danger`,
`bg-plate`. `packages/tokens/src/theme.ts` decides what each is worth in each theme, and the
Tailwind preset exposes **only** roles — `bg-noir` does not compile. That is deliberate and it
is enforced by a test, because the naming convention alone would not have held: a component
able to name a primitive pins itself to one theme *silently*, and the defect is invisible until
somebody switches the toggle on a screen nobody was looking at.

### What does not flip

**The product plate stays dark in both themes.** A flacon is lit in a dark room whichever way
the page is lit; a bottle on white is a catalogue cut-out. The home hero is the same decision
at full width, which is why paper mode opens on a black band — that is the composition, not a
bug. Any panel that must stay dark carries `data-theme="dark"`, which re-scopes every role
inside it, **and restates `text-ink`** — `color` inherits, so a headline that merely inherits
arrives in the outer theme's ink.

### Defaults

Dark is the default and the system preference is deliberately **not** read. The HIG would have
an app follow the system; this is a storefront, and a visitor whose laptop is in light mode
should not meet a different house than the one on the poster. The choice is offered explicitly
and remembered. Flipping to system-following is one constant: `DEFAULT_THEME`.

### The rule that will bite next

**Never apply an alpha to an ink role.** Every ink is tuned to sit just above 4.5:1 on the
surfaces it is allowed on, so `text-accent/90` spends a margin that was never there — it
measured 4.08:1 on paper. On noir the same utility looked like a refinement and cost nothing
visible, which is exactly why it survived review. *Soften a role by choosing a quieter role,
not by making it transparent.*

### The floor runs in opposite directions

On noir, less contrast means **darker**; on paper it means **lighter**. A reviewer carrying the
dark-theme instinct across will lighten `ink3` to soften it and take it straight through the
floor. And the floor is set by the lightest surface a label may be printed on — not by the
page. `faint` was `#8B837A`: 5.3:1 on noir, 4.28:1 on an `l3` panel, passing every assertion
that existed and failing the moment anything used the third depth step.

Both directions, every ink against every surface, are asserted in `packages/tokens`. The audit
runs per theme: `THEME=light pnpm --filter @diyar/web audit`.

---

## 8. The reveal — Le Dévoilement (founder, 19 Oct 2026)

Pressing a perfume's photograph dims the room, lifts the bottle out of its picture, stands
it up in light, and lets its notes rise from the nozzle to orbit it — top, heart, base. The
approved prototype is `design-reference/experiences/01-devoilement.html`; the shop's version
is `features/product/reveal`. The rules it keeps, and why:

- **Nothing about the packaging is invented.** The object is the house's own photograph —
  cut out, given a relief, relit — never a generated 3D model, which would draw a back of the
  bottle nobody photographed. The panel says so in one line ("made from the house's own
  photograph, with nothing added"). A claim the shop makes about a house's product is a claim
  it can show.
- **The room is dark in both themes.** The stage is scoped `data-theme="dark"` whatever the
  page: opening a perfume is walking into a dark room with one light. The colours are still
  the dark theme's roles — no new palette — and the mist and the notes' drawings are the
  family's own colour as light (`glassPalette(family).mist`, derived from the family token).
- **Law VI, read for a ceremony the visitor asked for.** The response to the press — the room
  dimming, the photograph lifting off the page — is immediate and within `slow`. The bottle
  STANDING UP is an arrival, not a response: it takes `ceremony`, the one place a click is
  followed by a long motion, because the visitor asked to watch it. Closing runs it back
  within `slow`. Nothing bounces; the light never comes from straight ahead (it would whiten
  the flat glass the way no studio light does).
- **The same object, never a substitute.** For the length of the move from page to stage the
  object lies exactly over the bottle in the photograph — same place, same angle, same light —
  so the eye cannot find a seam; only then does the picture dissolve around it.
- **Opt-in, and light.** The whole photograph is the control, with its name in a corner; it
  appears only where the browser can draw the bottle; nothing of the reveal loads until it is
  pressed. Reduced motion: the bottle simply stands, notes placed around it, no flight, orbit
  or mist.
- **One entry point first.** The product page only, until `reveal_open` has been measured
  (ANALYTICS_DEFINITIONS §2b). Cards elsewhere wait for the number.


---

## 9. The details — Les Détails (founder, 19–20 Oct 2026)

Luxury does not raise its voice; it shows in small things done the same way everywhere. The
approved prototype is `design-reference/experiences/04-details.html`; the shop's versions are
named below. The rules they keep:

- **Each answers the hand, and none is slower than `slow`.** The drop to the bag, the blotter,
  the glass all respond to a pointer or a press, so they stay inside law VI's response window.
  Only the ink, an ARRIVAL that nobody pressed for, takes `ceremony`.
- **One surface, one behaviour.** The product photograph is the reveal (press) and the loupe
  (hover, long press); the sillage therefore lives on the home page's opening perfume, never
  over the same photograph, and never over text.
- **Nothing pretends.** The loupe never magnifies past the house's photograph and prints the
  power it really reaches (`loupe-fit.ts`). The blotter prints the house's own top notes, named
  and drawn by the glossary. There is no size picker until there are sizes to pick.
- **No bounce, anywhere.** The prototype's bag jumped as it took the drop; the shop's bag
  breathes its spritz and lets its new number rise into the square. Overshoot is forbidden
  (`tokens.json`, `easing.$forbidden`).
- **From the reading edge.** The ink arrives from the right in Arabic and the left in English
  (asserted in `ink-mask.test.ts`); the blotter rises at the frame's reading start and leans
  outward; the drop's mist leaves the count forward.
- **A mouse's details stay a mouse's.** The lean, the sillage and the blotter need a pointer
  that hovers; a phone gets the drop, the loupe by long press and the ink, and a tap that
  opens the perfume is never delayed by any of them. Reduced motion stands every one still;
  the loupe still magnifies, without its glide.

| Detail | Where | File |
|---|---|---|
| La Goutte — the drop to the bag | every add-to-bag outside the reveal | `features/cart/drop.ts`, `AddToBag`, `BagLink` |
| La Loupe — the glass | the product photograph | `features/product/Loupe.tsx`, `loupe-fit.ts` |
| L'Encre — the ink | every `SectionHead` title | `features/shell/InkTitle.tsx`, `ink-mask.ts` |
| La Mouillette — the blotter | product cards | `features/catalogue/SpecimenCard.tsx` (CSS) |
| Le Sillage — the trail | the home page's opening perfume | `features/motion/Sillage.tsx`, `vapour.ts` |
| Le Flacon — the size picker | deferred: no size variants yet | — |

---

## 10. The day on the skin — La Durée (founder, 19–20 Oct 2026)

A perfume is not one smell but a sequence, and the product page draws it as a watch dial: three
rings record the three tiers as the hand passes the hours, the notes sit on their rings as
beads that light when the hand reaches them and evaporate when their time is over, and the
perfume's air swells and fades around the face. The approved prototype is
`design-reference/experiences/02-la-duree.html`; the shop's version is
`features/product/day/SkinDial.tsx`, and it replaced the "evolution" chart. The rules:

- **An illustration of two recorded words, said so.** Every shape is `skinDay` of the
  perfume's longevity and projection bands (`packages/domain`, tested). The caption is part
  of the component, not optional copy: "an illustration of the recorded bands, not a
  measurement", the bands, and their source — the house's word, a platform test or buyers'
  reviews, whichever it is. No sentence on the dial says how many hours a perfume lasts — a band
  is a word, never a number. The face carries hours because a clock does.
- **The visitor turns it.** Drag the hand round the face, use the arrow keys (it is a slider to
  assistive technology, with its position spoken as an hour and a part of the day), or press
  "spray" to watch the day pass at a steady pace. It never plays by itself: a long motion
  nobody asked for is the opposite of law VI. The hand has weight; it follows, it does not jump.
- **A clock is a real thing, so it does not flip.** The hand turns clockwise in both languages;
  the words beside it are Arabic-first.
- **The perfume's own colours.** The three rings are the family's colour stepped lighter for
  the top and deeper for the base (`tierTones`), one set per theme so an oud base never sinks
  into the dark room; the vapour is the same colours. Nothing else is coloured.
- **Compact.** One figure beside the notes, never the prototype's six-screen scroll pin. On a
  phone a finger on the middle of the face scrolls the page; only one laid on the rings turns
  the hand. Reduced motion: the hand goes where it is sent, no mist rises.
