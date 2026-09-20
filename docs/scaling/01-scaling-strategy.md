# Scaling strategy

Principle: **scale is earned by triggers, not planned by ambition.** The architecture audit
(`docs/architecture/02`) chose a modular monolith for exactly this reason. This strategy
defines the stages, what changes at each, and the conditions (`04-trigger-conditions.md`)
that justify each change. Nothing here is scheduled by date.

## 1. Stages (by active houses, the supply count the business is organised around)

| Stage | Houses | Character |
|---|---|---|
| 0 | 0–100 | one team, one city, one product; correctness and trust over scale |
| 1 | 100–1,000 | operations become a function; integrations replace manual steps; national delivery |
| 2 | 1,000–10,000 | platform behaviours emerge (self-serve onboarding with verification, seller tooling, marketing systems); data products |
| 3 | beyond | multi-category or multi-country questions; not designed now |

## 2. What scales, in what order

1. **Trust operations** (verification, moderation, support) — people first, tooling
   second, never removed.
2. **Money operations** (ledger, reconciliation, payouts) — automated early because they
   cannot be done by hand even at small volume (C1 lesson).
3. **Fulfilment integrations** (courier booking, tracking, remittance import) — when manual
   steps dominate ops time.
4. **Discovery** (search index, caching) — when measured latency or zero-result rates say so.
5. **Organisation** (functions, shifts, leads) — when cadences are missed.
6. **Architecture** (extract a runtime, add a queue, read replica) — last, on named triggers.

## 3. What does not scale by design

Manual seller approval and termination · second-person payout approval · review removal by
a person · the brand's restraint · one definition per number.

## 4. Anti-goals

Microservices, Kubernetes, a message broker, a search service, a data warehouse, a native
app, a warehouse — each has a trigger in `04`; none is a Stage 0 decision.
