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
| 1 | 2026-09-03 | Seller one-time codes are held in a process-local Map (`apps/web/src/features/seller/session.ts`), so they do not survive a restart and do not work across instances. | Sign-in is a declared stub that `assertProductionSafe` refuses to boot in production, so it cannot reach real users on its own. Building a durable store now would be building it twice. | ~Half a day: a `seller_login_codes` table with a TTL index, or Redis if one exists by then. | **Whichever comes first:** the SMS adapter becomes real, OR the web app runs more than one instance. Replacing the sender without replacing this store makes sign-in fail for a fraction of requests behind a load balancer — a symptom that will look like anything except this. | Claude |

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
