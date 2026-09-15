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

| 2 | 2026-09-09 | Rate limits on the public write paths (`packages/api/src/rate-limit.ts`) are a fixed-window counter held in the web process, so two instances mean two counters and twice the limit. | The alternative on the day it was needed was no limit at all: every public mutation — one-time codes, orders, tickets, applications, reviews, returns — was unbounded, and one of them costs money per request. An in-process counter that works on one instance is strictly better than a shared one that does not exist. | ~Half a day: move the counters to Redis, or to a `rate_limit_windows` table with a TTL index. Same interface. | **Whichever comes first:** the web app runs more than one instance, OR a per-IP limit is configured at the CDN and the two need to agree. | Claude |
| 3 | 2026-09-09 | A live house's whole row — `contact_phone` and `contact_email` included — is readable by anonymous traffic, because `public_read_live_sellers` is permissive and Postgres has no column-level row security. | The database-level alternative is to revoke the table grant and re-grant every other column by name, which moves the failure from "a query selected something it should not" (caught in CI) to "somebody added a column and forgot to grant it" (fails in production, in front of a customer). | ~A day: move contact details to a `seller_contacts` table with its own policies, and route the two legitimate readers through it. | A public read path needs a column from that table, OR the seller record grows anything more sensitive than a business phone number. | Claude |
| 4 | 2026-09-15 | A photograph's FILE can outlive its row. `photos.remove` deletes the row in the transaction and the stored object after it commits; if that second call fails, the object stays in storage with nothing pointing at it. Likewise an upload that is started and never confirmed leaves its object behind. | The other order is worse: deleting the file first means a failed transaction leaves a row pointing at nothing — a broken image on a live product. An orphaned object is invisible to every customer and costs a few megabytes. | ~Half a day: a scheduled sweep that lists keys under `products/`, and removes any older than a day with no `product_media` row. R2 lifecycle rules can expire abandoned uploads if keys are first written under a separate prefix. | **Whichever comes first:** the first storage bill that is reviewed line by line, OR storage growing measurably faster than the number of photographs. | Claude |
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
