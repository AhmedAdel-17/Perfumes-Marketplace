# QA — what was found, and why it survived

Two passes, newest first. The point of this file is the second column: a defect
list is a chore report; a list of *reasons things were missed* is the thing that
changes what gets built next.

---

# Second pass — 16 September 2026

The system roughly doubled after the first pass — search, house pages, light
mode, reviews, returns, support, the decision log, the owner's report, the
dispatch clock, photographs, editorial images, the browsing funnel, and a
dependency upgrade — and **none of it had been walked by hand.** Every automated
check was green the whole time.

Walked as three people on a fresh database: a customer (home, search, a perfume,
the bag, checkout, a real order placed, tracking, the houses directory, the
privacy page, support), a house (queue, products, the listing editor and its
photograph manager, returns, payouts), and an operator (queue, moderation,
reviews, returns, support, houses, content, site, decision log, reports). Then
the same screens at phone width.

**At the end of this pass: 677 domain, 347 database, 274 API, 50 wording, 123
token tests; 126/126 end-to-end on a fresh database; audit clean in both themes,
every surface, every width; typecheck clean across six packages.**

## Defects in the product

### 14. One delivery promise, two formulas

The product page said "يصل خلال ٢ إلى ٣ أيام". The bag, the checkout summary and
the confirmation of that same purchase all said 3–4. The shipping quoter's rule
is preparation time plus the courier's transit; the product page computed its
own — `ceil(hours / 24)` to that plus one — which drops the courier's first day
entirely.

The screen a customer *decides* on was the wrong one, and it promised sooner than
the screen they pay on. That is the direction that costs trust.

**Why it was missed.** Two independent formulas for one promise, and no test
compared them. The browser suite asserts the bag's wording and the checkout's
total; nothing asserted that the perfume page agreed with either. Automated
checks compare code against expectations, never one screen against the next.

**Fix.** `arrivalWindow(fulfilmentHours)` is exported from the quoter and used by
both, so the real courier tariff will move every screen at once.

### 15. A published page promising a retention the code does not keep

The privacy page — live, customer-facing — said anonymous browsing records are
kept **thirteen months**. The purge deletes them at **180 days**, and 180 days is
the figure proposed to counsel. Three numbers, two of them published.

**Why it was missed.** The page was written on 4 September, before the browsing
trail existed. Nothing holds published policy text to the code that implements
it, and nothing could: the page is content, the rule is SQL.

**Fix.** The page says 180 days, and A-1 in `OPEN_DECISIONS.md` now records that
the page, the cookie and the purge move together when counsel rules.

### 16. The publish gate admitted an image the shop refuses to render

Migration 0001 let a listing publish when a `product_media` row was primary, had
confirmed ownership and alt text. Migration 0021 added the facts the server reads
from an uploaded file, and the storefront renders only rows that carry them. So a
perfume could publish holding an image nothing would ever show — which is exactly
what the seeded catalogue did: three published perfumes, each with an editor
saying "هذه الصورة لم تُرفع بالطريقة المعتمدة ولا يمكن عرضها", and a shop drawing
the illustrated flacon instead.

**Why it was missed.** The gate and the domain's `listingGaps` are held together
by a parity test — so both sides agreed with each other, and both were wrong
together. Parity proves two implementations match; it cannot notice that the rule
they share is weaker than the one the renderer applies.

**Fix.** Migration 0024 adds `content_type IS NOT NULL` to the gate, and both
`hasPrimaryImage` implementations follow, so a house is never told a gap is
closed that Postgres will refuse. The seed now writes a real PNG through the
local store and records its true facts — the catalogue has actual photographs for
the first time.

### 17. No icon, on any tab, ever

No `public/`, no icon file, no `icons` in the layout's metadata. Every browser tab
showed a blank square, and every page load spent a request on `/favicon.ico` and
got a 404 — sixteen of them in one short walk.

**Why it was missed.** Nothing fails. Not the build, not the typecheck, not axe,
not a test. It is visible only to a person looking at a browser tab.

**Fix.** `app/icon.svg` — a flacon in the brand's own three values. The 404s are
gone from the log.

### 18. `٣ مرّة` — the plural bug, in the module built to prevent it

The owner's new pre-order funnel rendered `{events} مرّة` with the noun written
once, in the singular, beside a number that varies. Three checkout starts read
"٣ مرّة" where Arabic requires "٣ مرّات". The visitor figure next to it carried no
noun at all.

This is defect #2 of the first pass, made again, by me, in code written the day
before — in the one project that has a six-form pluraliser specifically because
this mistake is invisible to an English speaker.

**Why it was missed.** The e2e test I wrote for that section asserts the stage
names appear and the section is not empty. It never read the numbers. Axe checks
contrast and labels, not grammar. A screen can be perfectly accessible and
illiterate.

**Fix.** Two new counted nouns (`TIME`, `VISITOR`) through `counted()`, held to
all six forms by the same test as every other noun.

## Defects in the fixtures

### 19. A test fixture in a shape the system cannot produce

Tightening the publish gate (#16) broke four fixtures that published with an
unverified image — expected, and each was corrected. Then my correction to one of
them broke **five unrelated cart tests**: the fixture's stored path was `p.jpg`,
a shape the server never issues, so the moment the row carried facts the cart
tried to build a URL for it and `assertMediaKey` refused.

**Why this matters more than it looks.** The fixture had been fine for months
*because* it was broken — the unverified row never reached the code that turns a
key into an address. A fixture that could not exist in production is a test that
proves something about a system nobody runs.

**Fix.** Fixtures use real keys, and the "an unverified row shows no photograph"
case now creates that condition itself and restores it, instead of depending on
the fixture being wrong.

## What I checked and did NOT report

Six candidates were investigated and dropped. They are listed because the cost of
a QA pass is mostly here, and because a report padded with non-defects hides the
real ones:

- the flacon's engraved wordmark "announcing" itself — it is correctly
  `aria-hidden`; my inspection tool flattens SVG text that a screen reader skips;
- "التوصيل · شحنة" and "عطر" without numerals — correct Arabic: `counted()`
  returns the bare noun for one and two, and there is a test saying so;
- numbers "missing" from the product page — present in the DOM; the same
  flattening;
- Western digits beside Arabic text — the documented split: data numerals are
  Latin, editorial counts Arabic-Indic;
- `/ops/listings` returning 404 — my own wrong URL; the route is
  `/ops/moderation`;
- an empty bag at phone width — I had completed the purchase; checkout clears it.

## What found these

Not a test. **Walking the product as the three people who use it**, on a fresh
database, and reading what was on the screen rather than what the code intended.
Every one of the five defects passed the typecheck, the unit tests, the browser
suite and the accessibility audit — because each is a disagreement *between*
things that are individually correct: two formulas for one promise, a page and a
rule, a gate and a renderer, a noun and a number.

The first pass's rule still holds and still works — write the rule, write a test
that can fail, then make it fail on purpose; it was used again here on the
publish gate and on the arrival window. What this pass adds is that the rule
cannot find a contradiction nobody has looked at. For that, somebody has to look.

---

# First pass — 4 September 2026

At the end of that phase: **530 unit and integration tests, 46 end-to-end tests,
audit clean across eleven surfaces and six widths.**

---

## Defects in the product

### 1. The phone regex accepted a comma

`^(\+201|01)[0-2,5]{1}[0-9]{8}$` — written to mean "0 to 2, or 5", and inside
a character class a comma is a literal comma. `01,12345678` validated as an
Egyptian mobile.

Phone is the primary identity in this system: it addresses the order, gates the
tracking page, and will carry the one-time code. This was a corrupt identity
accepted at the front door.

**Why it was missed.** Every existing test fed it plausible numbers. A
validator is only tested by the things it must *refuse*, and refusal cases have
to be written deliberately because they never occur to you while building the
happy path. There are now thirteen of them for this field alone.

### 2. One of the four decline buttons did nothing

The seller portal offered `cannot_fulfil_sla`. That code appears in no
vocabulary this system has — not the domain's `REJECTION_REASONS`, not the
database enum, not the Zod schema. It rendered correctly, and a house saying no
in the one way the interface offered was silently refused.

**Why it was missed.** Three copies of the list existed. The end-to-end test
checked that the reasons *appeared*, which is not the same as checking that
pressing one does anything — and appearance is the easy thing to assert, so it
is the thing that gets asserted.

**Fix beyond the fix.** The API now re-exports the domain's list, and the
portal types its labels as a full `Record` over it, so a code without wording
or wording without a code fails the typecheck. Verified by deleting a label and
watching TS2741.

### 3. Arabic-Indic numerals were rejected everywhere

An Egyptian keyboard produces ٠١٢…, and every validator downstream reads
Western digits. A customer typing their own phone number in their own numerals
was told it was not a valid Egyptian mobile, with nothing on screen suggesting
what to change.

On the market this product is built for, that is not an edge case. It is a
keyboard layout.

**Why it was missed.** Everything was tested by typing on a Latin keyboard.
The whole team — such as it is — inputs Western digits by habit, so the
failing path was never travelled.

**Fix.** Conversion lives in the shared `Field`, keyed off `inputMode`, which
already declares the distinction: `tel` and `numeric` hold digits as data,
`text` holds prose. A street name keeps the numerals it was given. Two Unicode
ranges, not one — U+06F0 is the Persian/Urdu set and several Android Arabic
keyboards emit it; handling only U+0660 fixes the fault for most people and
leaves it exactly as impassable for the rest.

### 4. `'use client'` below an import (introduced during this phase)

A one-line import added above the directive. A directive prologue only counts
before any other statement, so the shared form field quietly stopped being a
client component and every page carrying a form returned 500.

Typecheck clean. Lint clean. Build clean.

**Why it would have been missed.** Nothing in the toolchain has an opinion
about it. The audit now checks it statically, with comments stripped first so
the file that explains in prose why it deliberately has no directive is not
accused of losing one.

This is the second time a React Server Components boundary has produced a
silent, type-clean failure in this project. Recorded in ARCHITECTURE.md as a
class, not an incident.

### 5. `InvalidMoney` thrown for a short random-byte read

From the order-reference generator, where no money is involved. A delivery
layer mapping error codes to Arabic would have told a customer their payment
amount was invalid because a randomness call came back short.

### 6. A comment reasoning about an alphabet it does not have

The reference generator's note weighed modulo bias "across a 25-symbol
alphabet". The alphabet has eighteen symbols.

**Why this keeps happening.** This is the fourth instance in this project of
*a comment asserting a property the code beneath it does not have* — the buy
button's height, the `Reveal` bet, the reference alphabet's `8`, and now this.
It is now a named thing I look for, because it is invisible to every tool: the
comment is the part no compiler reads.

### 7. Dev logs committed, carrying working credentials

The one-time codes printed for the seeded seller and operator accounts. Removed
from the index and ignored.

---

## Defects in the tooling

### 8. Every `pnpm` command failed, including `dev`

`pnpm-workspace.yaml` carried a half-written `allowBuilds:` stub with the
literal text "set this to true or false". pnpm 11 renamed the key and silently
ignores `onlyBuiltDependencies`, so the dependency check failed on esbuild and
took every command down with it. The error named esbuild and said nothing about
the key.

### 9. The audit died instead of reporting

Its static checks ran last and its report ran after them. When defect 4 took
the form pages down, the audit crashed on a missing form label while holding,
unprinted, the finding that named the cause. Static checks now run before a
browser opens, and a crash is recorded as a finding rather than an exit.

---

## Defects in the tests themselves

These matter more than the product defects, because a wrong test is worse than
no test: it reports safety.

### 10. Three assertions that could not fail

- *"the delivery address must not leak to a wrong phone number"* — the tracking
  screen never renders an address under any circumstances. It passed, and would
  have passed with the phone check deleted entirely.
- *"a double tap creates one order"* — counted references on the confirmation
  page. A duplicate order gets its own reference on its own page; that page
  shows one either way.
- *"dispatch clears the shipping step"* — asserted `remaining < 2`. There is
  only ever one order in that step, so it was true before the click as well.

**The rule that came out of it.** A refusal test derives what it checks for
from the *successful* case, so it can only pass for the right reason. The
tracking tests now capture what a real lookup discloses and assert none of it
appears; the duplicate test counts the customer's phone across the seller
queues, which is where a duplicate would actually surface.

### 11. A test that counted rows it did not own

The duplicate-order check used a fixed phone number. The development database
persists between runs, so it passed once and then failed forever — the second
run found the first run's order beside its own. The phone is now derived from
the clock.

### 12. Sign-in returned before the screen existed

The helper waited for the URL to change. Both portals render a shell on the
server and fetch the queue from the client, so the moment the URL changed the
page was a header and the word "loading" — which reads exactly like an empty
queue, and did, for two rounds of debugging.

### 13. The harness printed only the first line of a failure

Which threw away the diagnostic a failing test had gone to the trouble of
building to explain itself, and cost a whole probe script to answer a question
the message already contained.

---

## What actually works

The method that found nearly all of this: **write the rule, write a test that
can fail, then make it fail on purpose.**

Negative verification was run against the customer-lookup authorisation (phone
dropped from the WHERE clause), the label exhaustiveness (a label deleted), the
client-directive guard (an import moved above the directive), and the money
reconciliation (one piastre added to the bag total). Each went red, naming the
right thing. A test that has never failed has not been shown to be a test.
