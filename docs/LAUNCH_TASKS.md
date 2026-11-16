# Launch tasks — what stands between today and the first real customer

Written 16 Nov 2026, from a full review of the code, the docs and a walk of the customer
journey. `MASTER_EXECUTION_PLAN.md` stays the master; this is the short list cut from it and
from the review, in the order it has to happen. Each line names its plan task where one
exists. **Status:** DONE · DOING · READY (can start now) · BLOCKED (on the named decision).

The honest summary: the storefront is ready to show; the order and money loop is not ready
for a real customer. Most of what blocks it is a founder decision, not engineering.

---

## A. Founder decisions — these unblock almost everything else

| # | Decision | Unblocks | Plan |
|---|---|---|---|
| A1 | SMS vendor chosen and account opened (ADR-11) | sign-in codes, order notifications, OTP at checkout | P0.2.6, P1.1.1 |
| A2 | Approve ADRs 01–15 and FD-1..7 | the whole Phase 1 build | P0.2.6 |
| A3 | Pilot commission rates (D-4) and attribution rule for branded search (DR-02) | attribution capture, commission rules from the database | P0.2.5 |
| A4 | Checkout policy: guest, or OTP on the first order (D-2) | phone verification, review forgery fix | P0.2.5 |
| A5 | Service area (D-7): do houses ship only where they declare, and is the platform promise Cairo/Giza? | refusing an address a house does not serve | P0.2.5 |
| A6 | Cancellation and refusal policy: who may cancel, until when; who bears a refused parcel's cost | cancel / refuse states | P0.2.5, P1.2.1–2 |
| A7 | Payout direction (D-5) and confirmation that pilot money is paid by hand (DR-03) | payout ledger design | P0.2.5 |
| A8 | Hosting budget and runway (D-9); staging/production accounts (Vercel, Supabase, R2, Sentry) | deployment, monitoring, backups | P0.2.3, P1.4.4 |
| A9 | Founders' agreement, entity, accountant (D-8, D-10) | seller agreements, invoices, VAT wording | P0.2.1–2 |
| A10 | Counsel engaged: terms, privacy, returns, seller agreement, prohibited claims | publishing final legal pages | P0.3.1–5 |

## B. Engineering that needs no decision — READY now

| # | Task | Status | Plan / debt |
|---|---|---|---|
| B1 | Identity v3 across the customer site; reveal reworked; checkout, confirmation and tracking smoothed | DONE (16 Nov) | DESIGN_DOCTRINE §12 |
| B2 | `markDelivered` writes an audit entry with the operator who pressed it (migration 0042) | DONE (16 Nov) | MVP gate 6 |
| B3 | `recordRemittance` refuses a sub-order that is not delivered or has no shipment | DONE (16 Nov) | money path |
| B4 | Designed error pages (`error.tsx`, `global-error.tsx`) in both languages and themes | DONE (16 Nov) | DEBT #19 (part) |
| B5 | `robots.ts` and `sitemap.ts` for the shop's public pages | DONE (16 Nov) | SEO (CLAUDE.md §14) |
| B6 | Checkout warns, per house, when the chosen governorate is not one the house says it delivers to (needs the service area in the bag's pricing) | READY | disclosure only; refusal is A5 |
| B7 | Idempotent order placement: a retried tap on mobile data makes one order, not two (migration 0043) | DONE (16 Nov) | DEBT #12, P1.2.4 |
| B8 | Stock decremented at placement, so two people cannot buy the last bottle | READY | DEBT #8, P3.2.1 (simple form) |
| B9 | Route skeletons (`loading.tsx`) matching each page's layout | READY | DEBT #19 |
| B10 | Payout-adjustment screen (the table exists, no screen) | READY | MVP gate 6 |
| B11 | `-- rollback:` note on every migration | READY | DEBT #21 |
| B12 | Transactional outbox and job runner (no vendor needed; scheduler host is A8) | READY | P1.1.2, DEBT #5, #22 |

## C. Engineering that waits on a decision in A

| # | Task | Waits on | Plan / debt |
|---|---|---|---|
| C1 | Real SMS sender behind the existing port | A1 | P1.1.1, DEBT #1 |
| C2 | Six order notifications (house told of an order, customer told of dispatch…) | A1, B12 | P1.1.3 |
| C3 | Customer cancel before dispatch; operator cancel; refusal with reason, attempts and cost bearer | A6 | P1.2.1–2, DEBT #11 |
| C4 | A refund moves the sub-order to `returned` and reverses on the statement | A7 | P1.2.3, P3.1.4, DEBT #7 |
| C5 | Attribution captured end to end (source on every order) | A3 | P1.3.1, DEBT #9 |
| C6 | Commission rules and fee terms read from the database, with an audited admin screen | A3 | P3.2.2, DEBT #10 |
| C7 | Phone verification at checkout and risk flags | A1, A4 | P1.4.1 |
| C8 | Consent records at checkout, privacy request workflow | A10 | P1.4.2, P4.7.1 |
| C9 | Refuse an address a house does not serve (server-side) | A5 | — |
| C10 | Payout ledger, payout states, two-person approval | A7 | P3.1.1–3, DEBT #6 |
| C11 | Staging and production deploy, error monitoring, backups, rate limits in the database | A8 | P1.4.3–5, DEBT #2 |
| C12 | Final terms, privacy, returns and seller-agreement wording on the live pages | A10 | P0.3.3–5 |

Note for C12: today's terms page promises a dispatch message with the tracking number and free
cancellation before dispatch. Neither exists yet (C2, C3). Either build them before launch or
have counsel change the wording — do not launch with both untrue.

## D. Before the first real order (pilot gate)

1. All of B done; C1, C2, C3, C4, C7, C11 done.
2. One complete test order per pilot house on staging: placed → confirmed → dispatched →
   delivered → remitted → statement, plus one cancel, one refusal and one return.
3. Browser suite and audit green on staging, both themes.
4. Manual money procedure written and rehearsed (P1.4.7).

## E. Deferred — do not build (CLAUDE.md §9)

Native apps, warehouse, showroom, AI matching, designer-name search, open seller sign-up,
international, loyalty redemption.
