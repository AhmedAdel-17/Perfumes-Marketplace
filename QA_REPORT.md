# QA — what was found, and why it survived

Written at the end of the QA phase, 4 September 2026. The point of this file
is the second column. A defect list is a chore report; a list of *reasons
things were missed* is the thing that changes what gets built next.

At the end of this phase: **530 unit and integration tests, 46 end-to-end
tests, audit clean across eleven surfaces and six widths.**

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
