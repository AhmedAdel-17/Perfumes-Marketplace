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
| 1 | 2026-09-03 | **Narrowed again 2026-09-20 (task P0.1.1).** The store is now WIRED, not only built. Both sign-in paths call `LoginCodeStore` against migration 0025 `login_codes` — seller under audience `seller`, operator under `platform` — and the in-process `Map` on `globalThis`, together with the phone-only key that let a code issued for a house verify at the operator console, is deleted. What REMAINS is the SMS SENDER: `consoleOtpSender` is a declared stub that prints the code, and `assertProductionSafe` refuses to boot production while it is the configured sender. So sign-in is durable and multi-instance safe, and still cannot go live. | The sender needs a vendor, an account and a contract, none of which is an engineering decision — ADR-11 in `DECISION_REGISTER.md`, approved by task P0.2.6, chooses it. Building an adapter against an unchosen vendor would be the wrong adapter. The store landing first is what makes the sender a single, reviewable substitution. | ~Half a day once the vendor is chosen: one `OtpSender` implementation behind the existing port, its credentials in the environment, and the startup guard's stub list narrowed by one. No call site changes. | **The one condition left:** the pilot needs a real house or buyer to sign in. Task P1.1.1, blocked on P0.2.6 (ADR-11 vendor + account). The multi-instance trigger is now SPENT — the store already survives it. | Claude |

| 2 | 2026-09-09 | Rate limits on the public write paths (`packages/api/src/rate-limit.ts`) are a fixed-window counter held in the web process, so two instances mean two counters and twice the limit. | The alternative on the day it was needed was no limit at all: every public mutation — one-time codes, orders, tickets, applications, reviews, returns — was unbounded, and one of them costs money per request. An in-process counter that works on one instance is strictly better than a shared one that does not exist. | ~Half a day: move the counters to Redis, or to a `rate_limit_windows` table with a TTL index. Same interface. | **Whichever comes first:** the web app runs more than one instance, OR a per-IP limit is configured at the CDN and the two need to agree. | Claude |
| 3 | 2026-09-09 | A live house's whole row — `contact_phone` and `contact_email` included — is readable by anonymous traffic, because `public_read_live_sellers` is permissive and Postgres has no column-level row security. | The database-level alternative is to revoke the table grant and re-grant every other column by name, which moves the failure from "a query selected something it should not" (caught in CI) to "somebody added a column and forgot to grant it" (fails in production, in front of a customer). | ~A day: move contact details to a `seller_contacts` table with its own policies, and route the two legitimate readers through it. | A public read path needs a column from that table, OR the seller record grows anything more sensitive than a business phone number. | Claude |
| 4 | 2026-09-15 | A photograph's FILE can outlive its row. `photos.remove` deletes the row in the transaction and the stored object after it commits; if that second call fails, the object stays in storage with nothing pointing at it. Likewise an upload that is started and never confirmed leaves its object behind. **Widened 2026-09-15 (5.7.6):** editorial images under `content/` are never deleted at all — an image replaced in a block, or on a page archived, keeps its `content_images` row and its file, because an old revision may still name it and revisions are immutable. | The other order is worse: deleting the file first means a failed transaction leaves a row pointing at nothing — a broken image on a live product. An orphaned object is invisible to every customer and costs a few megabytes. | ~Half a day: a scheduled sweep that lists keys under `products/`, and removes any older than a day with no `product_media` row. R2 lifecycle rules can expire abandoned uploads if keys are first written under a separate prefix. | **Whichever comes first:** the first storage bill that is reviewed line by line, OR storage growing measurably faster than the number of photographs. | Claude |
| 5 | 2026-09-16 | The browsing-event retention sweep is written and tested (`app.purge_analytics_events`, migration 0023) and **nothing calls it**. Events therefore accumulate past the 180 days A-1 proposes. | There is no scheduler in this system — no cron, no queue, no worker. Building one to run a single nightly DELETE would be a new piece of infrastructure to operate, on the day the table holds a few thousand rows and the retention promise is not yet due to bite. Writing the function now means the rule exists, is proved, and is one line away from being scheduled. | ~An hour once any scheduler exists: a platform-role call to `app.purge_analytics_events(180)` daily. Until then, an operator can run it by hand. | **Whichever comes first:** any scheduler arrives (payout runs, courier polling and abandoned-media sweeps all want one), OR 180 days pass from the first recorded event — 16 Mar 2027 at the latest. | Claude |
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
