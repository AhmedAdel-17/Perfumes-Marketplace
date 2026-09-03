# Design Doctrine

**Founder directive, 1 September 2026:** the reference standard is Dior, Saint Laurent and
Xerjoff. This is not a styling preference — it is the product. A perfume marketplace that
feels ordinary has already failed, because the entire category sells on desire.

This document turns that into rules an engineer can apply and a reviewer can check.

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

Amiri for Arabic headings. Bodoni Moda for Latin labels, always letterspaced, always
small-caps. IBM Plex Sans Arabic for everything else. Set the Arabic scale first — Arabic
needs more leading than Latin, and every app that sets Latin first produces cramped,
amateur Arabic.

Letterspacing is not decoration. `letterSpacing.label: 2.4` and `wordmark: 8` are the
difference between a fashion house and a storefront template.

### IV. One accent, and use it sparingly

Noir, bone, and brass. That is the palette. Brass is for moments — a price, an accent rule,
a single active state. The instant a second accent colour appears, the impression collapses.
Scent-family and note-tier colours exist for data visualisation only and never for chrome.

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
  "$rule": "Nothing under 120ms. Nothing bouncy. Ever."
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

Photography is the product. Full-bleed, dark, art-directed. Never a white-background cutout
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
- A grey lighter than `#8B837A` on noir
- Any hardcoded colour, size or spacing value that bypasses the tokens

---

## 4. The detail checklist

Run per screen, before it is called done. This is what "take care of the small details"
means operationally.

- [ ] Every tap target measured at 44pt — measured, not eyeballed
- [ ] Press state present and felt on every interactive element
- [ ] Focus ring visible and correct (2px brass, 2px offset)
- [ ] Skeleton matches final layout dimensions exactly — zero layout shift
- [ ] Empty, error and offline states designed, not defaulted
- [ ] RTL correct with mixed Arabic/Latin content
- [ ] Directional icons flipped; logos and real-world objects **not** flipped
- [ ] Progress and intensity meters fill from the right — **asserted in a test, not eyeballed** (see the trap below)
- [ ] Contrast checked against `$contrastNotes`, not assumed
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
