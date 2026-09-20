# Value propositions

Each proposition states the value, who receives it, the founding-pack basis, the evidence
that would prove it (doc 02 evidence hierarchy), and what in the product delivers it.

## 1. For customers

| Value | Basis | Proof it works | Product carrier |
|---|---|---|---|
| **Compare local perfumes on the same terms** — concentration, notes, family, performance bands with their source, size, price, delivery | doc 01 §2, §5; doc 04 §4 | comparison views followed by purchase; cross-house sessions | catalogue schema (FACT), comparison (planned) |
| **Buy from houses somebody checked** — identity, product responsibility, return route, test order | doc 06 §3 | refusal and complaint rates below the market's COD baseline (`docs/market/01`) | verification checklist (FACT), verified mark (planned) |
| **Read reviews that could only come from a delivered order** | doc 06 §10 | review count per delivered order; no seller deletions | delivery-gated reviews (FACT) |
| **No hidden costs** — per-shipment delivery and dates before you pay | doc 03 principle, doc 06 §6 | zero "surprise fee" tickets | cart/checkout (FACT) |
| **One relationship** — one phone, one tracking page, one support route across houses | doc 01 §6 | ticket resolution without bouncing to sellers | tracking + support (FACT) |

## 2. For sellers

| Value | Basis | Proof it works | Product carrier |
|---|---|---|---|
| **A storefront and order system in a day** instead of a website project | doc 01 §3 seller promise | time from approval to first live listing | listing flow, photos, storefront (FACT) |
| **Fair economics**: low fee on your own customers, marketplace rate only where we created the demand | doc 03 §2–3 | effective take rate per house visible and reproducible | attribution + commission snapshot (FACT design; capture inert — C4) |
| **Money you can check**: itemised statement, dispute deadline, one settlement per sale | doc 03 §7 | zero unresolved statement disputes | ledger (planned; C1 today) |
| **Incremental demand** from category discovery, comparison and cross-house browsing | doc 01 §8 loop | marketplace-attributed orders per house per month | search/compare/merchandising |
| **Reputation you can carry**: verified status, ratings, performance indicators | doc 06 §11 | houses cite DIYAR ratings elsewhere (ASSUMPTION) | ratings, indicators (partly built) |
| **Operations you don't have to build**: SLA clocks, courier, COD reconciliation, support | doc 04 §3 seller list | owner hours saved per week (interview-measured) | queue (FACT), courier/reconciliation (planned) |

## 3. For the platform (why the model holds)

| Value | Basis |
|---|---|
| Earns more when it creates demand or performs operations; never taxes seller-owned demand | doc 03 core model |
| Accumulates the normalised Egyptian scent catalogue and verified transaction/review history — the defensible assets (doc 01 §8) | see `docs/data/` |
| Owns the customer relationship across houses, which houses individually cannot | doc 01 §6 |

## 4. Value-proposition tests the pilot must pass (doc 02 §10 scorecard, restated)

- ≥ 3 houses routing live traffic; ≥ 50 completed orders.
- Sellers keep the bio link after the pilot (behavioural proof of SJ1).
- Customers cross-shop (observed searches/purchases across houses).
- Positive contribution or a clear path without hidden subsidy.
- Statements accepted without dispute (proof of SJ4).

## 5. Where the propositions conflict (OPEN DECISIONS)

| Conflict | Resolution path |
|---|---|
| Sellers want their customers' data; platform owns the relationship (doc 03 §8: seller gets transaction data necessary to serve its orders) | Seller agreement + PDPL counsel (`docs/legal/`) |
| "One support route" vs S-1 house support role | founder decision (OPEN, `OPEN_DECISIONS.md` S-1) |
| Low fee on seller-originated orders vs cost to serve them (doc 03 §5 shows EGP 2 contribution) | fee model options in `docs/economics/02` — founder decision D-4 |
