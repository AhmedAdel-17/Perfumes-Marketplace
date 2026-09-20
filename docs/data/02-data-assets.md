# Data assets register

Sensitivity: **P0** personal data (PDPL), **P1** commercially confidential, **P2** internal,
**P3** publishable. Retention figures marked (proposed) await counsel (`docs/legal/03`).

| Asset | Owner | Source | Purpose | Quality requirement | Sensitivity | Retention | Business value | Future use |
|---|---|---|---|---|---|---|---|---|
| Product data (identity, commerce, compliance, policy fields) | house (facts), category manager (normalisation) | seller entry / import | listing, search, compare, compliance | required fields enforced by gate (FACT); duplicates checked | P3 (public), compliance docs P1 | life of listing + revisions forever | the catalogue asset | enrichment, similarity |
| Fragrance attributes (concentration, form, family, gender positioning) | category manager | seller entry from closed vocabularies | filter, compare | enum-only (FACT) | P3 | forever | discovery | facets |
| Scent notes (top/heart/base) | category manager | seller entry | pyramid, search, compare | today free text arrays; needs dictionary | P3 | forever | the differentiator | similarity, "smells like" without designer names |
| Performance (longevity, projection + source) | house or platform or reviews | seller / platform test / review aggregate | honest expectation | source mandatory (FACT) | P3 | forever | trust | review-aggregate bands |
| Reviews (six dimensions, body, byline) | customer (author), platform (moderation) | delivered orders only | trust, aggregate bands, house indicators | gate in three layers (FACT); moderation logged | P0 (author phone link), P3 (published text) | forever (published); author link per PDPL | the second asset | quality signals |
| Seller performance (SLA, cancellations, refusals, complaints) | ops | transitions, shipments, tickets | enforcement, merchandising eligibility, seller dashboard | computed from append-only facts | P1 | forever (aggregates) | trust and supply quality | ranking inputs |
| Customer preferences (families viewed/bought, houses repeated) | product | orders (identified), browsing (anonymous) | repeat, cross-brand, future recommendations | derived; identified only from orders | P0 | orders per statutory period; browsing 180 d (proposed) | retention | personalisation (Phase 2+) |
| Search behaviour | product | `search`, `filter_apply` counts, zero-result counts | catalogue gaps | no query text (FACT) | P2 | 180 d raw | discovery tuning | synonym dictionary from *house-side* naming, not from customers' text |
| Purchase behaviour (orders, sub-orders, line items) | finance / product | checkout | everything downstream | reconciling CHECKs (FACT) | P0 | statutory (counsel) | core | cohorts |
| Attribution (touches, decisions, windows) | business founder | cookie trail → placement | fee fairness, disputes | trail kept, windows snapshotted (design FACT; capture inert) | P2 (no personal data in touches) | with the order | the fee model's proof | campaign ROI |
| Order history per customer | product | orders | repeat, support | phone-keyed | P0 | statutory | relationship | account claim (D-2) |
| Returns (reason, cost bearer, refund) | ops / finance | return lifecycle | policy, cost, house quality | reason codes only (FACT) | P0 (case), P1 | with the order | cost control | risk |
| Refusals (reason, attempts, governorate) | ops | courier/ops | COD economics, area policy | reason codes (doc 06 §7) | P0 (address), P1 aggregates | with the order | the largest cost line (doc 03 §4) | risk flags (manual) |
| Cancellations (actor, reason) | ops | transitions | SLA, house quality | reason codes | P1 | with the order | supply quality | — |
| Cross-brand purchasing | product | orders by customer across houses | marketplace proof (doc 02 §11) | derived | P0 → P2 aggregate | aggregates forever | the model's proof | merchandising |
| Marketing interactions (campaign clicks, creator codes) | business founder | links | CAC, attribution | code registry | P2 | 180 d raw | growth economics | creator payouts |
| Seller operational data (stock, prices, SLAs, delivery arrangement, fee terms) | house / admin | portal, admin | operations, statements | snapshotted per order | P1 | forever (versions) | seller OS | forecasting |
| Ledger / payouts | finance | events | statements, margin | append-only, settled once (target) | P1 | forever | money truth | finance reporting |
| Audit log | admin | decisions | accountability | append-only (FACT) | P1 | forever | governance | — |
| Consent and privacy requests | compliance owner | checkout, requests | PDPL | complete records | P0 | per law | licence to operate | — |
| Verification evidence (IDs, documents) | ops / legal | onboarding | trust | private bucket, signed reads (target) | P0 | per law; deleted on exit per counsel | trust | — |
| Photographs | house (ownership confirmed) | uploads | product, brand | dimensions verified (FACT) | P3 | life of listing | conversion | — |

## Gaps (FACT)

Notes dictionary absent · attribution capture inert · ledger absent · cohort tables absent ·
consent records unused · verification evidence stored as text references.
