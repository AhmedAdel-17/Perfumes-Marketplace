# Technical Debt Register

Standing directive: **zero tolerance for technical debt.** Anything that must ship imperfect
is recorded here — with a reason, a cost, a trigger, an owner and a date — or it does not
ship.

**Debt that is not in this register does not exist and will not be paid.**

An empty register is the goal state, not a sign nobody is looking.

---

## Open

| # | Date | What | Why it was accepted | Cost to fix | Trigger that forces the fix | Owner |
|---|---|---|---|---|---|---|
| — | — | *(none)* | — | — | — | — |

---

## Paid

| # | Date opened | Date paid | What | How |
|---|---|---|---|---|
| — | — | — | *(none)* | — |

---

## What counts as debt

- A shortcut taken knowingly to hit a date
- A missing test on a path that has one
- A hardcoded value that should be configuration
- A dependency-rule violation accepted under time pressure
- A design that ships below the `DESIGN_DOCTRINE.md` standard
- A schema decision made without the review it warranted

## What does not count

- A deliberate scope decision (that belongs in `OPEN_DECISIONS.md`)
- A deferred feature (doc 04 §10)
- A reversible choice recorded in `TECH_STACK.md` §9
