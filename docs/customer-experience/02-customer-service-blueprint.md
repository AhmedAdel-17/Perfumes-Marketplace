# Customer service blueprint

Front stage (what the customer sees), back stage (what a house or operator does), support
systems (what the platform runs), evidence (what is recorded). One row per stage of
`01-customer-journey.md`. "Owner" follows doc 06 §1. Response targets follow doc 06 §9
and are **starting objectives to be calibrated to staffed hours** (DOCUMENTED).

| Stage | Front stage | Back stage (people) | Support systems | Evidence recorded | Owner | Target |
|---|---|---|---|---|---|---|
| Arrive | house storefront / home with trust band | — | attribution capture; CDN | touch (channel, ref, time) | tech | LCP < 2.5 s throttled |
| Discover / search / filter | photographs, ratings, verified marks, filters | category manager curates; moderation keeps claims clean | catalogue, search, curation | browsing events (anonymous) | category | zero-result rate reviewed weekly |
| Evaluate / compare | notes, bands with source, reviews, house panel, delivery fee & window | house supplies facts and photographs; platform moderates | listing gate, claims scanner, review gating | listing revisions, moderation audit | ops / category | moderation < 1 business day |
| Cart / checkout | per-house shipments, total, COD terms, phone code (policy) | — | pricing on server, idempotency, stock reserve, risk flags | order, sub-orders, snapshots, consent record | tech | order place p95 < 2 s |
| Confirmation | reference, windows, SMS with link | — | outbox → SMS | notification record | tech | SMS within 1 min |
| Seller confirmation | "house confirmed" message | house confirms or declines with coded reason within SLA | queue, countdown, pre-breach alert to house, breach flag to ops | transition, SLA facts | house; ops monitors | answer within house SLA (24 h default, to be measured) |
| Dispatch | "on its way" + tracking | house books courier, records tracking | manual → Bosta booking | shipment | house | dispatch within SLA (48 h default) |
| Delivery | courier at the door; cash paid | courier delivers or records refusal code; ops confirms outcome (until webhook) | courier events, remittance | delivery/refusal, proof, COD collected | ops / courier | first-attempt success tracked by governorate |
| Exceptions (late, lost, damaged) | proactive message: what happened, what we're doing | ops opens a case, contacts house/courier | exception report, tickets | ticket, timeline | ops lead | P2 same business day |
| Support contact | one form/number; ticket reference; reply visible on tracking | operator answers; house consulted through the platform | support queue, priority by category | ticket, messages, resolution code | ops | P0 immediate · P1 same hour · P2 same day · P3 one day |
| Return / refund | request from tracking; state visible; refund confirmed by message | house agrees/receives; admin approves refund and cost bearer | return lifecycle, ledger reversal, payment refund | return, ledger entries, audit | ops / finance | decision within 2 business days (ASSUMPTION, to set) |
| Review | asked by message after ~7 days | moderation only for abuse/PII/spam, never criticism | review gate, moderation audit | review, hide/restore log | ops | moderation within 1 business day |
| Repeat / cross-brand | reorder link; house page; other-house rails | — | house pages, rails | orders, direct-return metric | product | — |

## Service standards the customer can hold us to (RECOMMENDATION — publish once counsel approves wording)

1. You see every delivery fee before you pay.
2. You are told at every step: received, confirmed, on its way, delivered.
3. You can cancel before dispatch from your tracking page.
4. Returns follow the listing's stated eligibility and the legal windows (`docs/legal/`).
5. One support route; we answer, not the house.
6. Reviews are only from delivered orders and are never removed for being negative.

## Failure playbooks (doc 06 §8 cases mapped to system actions)

| Case | First response | System action | Evidence |
|---|---|---|---|
| Unopened return | apply policy and legal right; arrange return | return request → approved → in transit | seal/condition photo, delivery date |
| Leakage / damage | replacement or refund first; investigate seller/courier | return with `damaged_in_transit`; cost bearer proposed courier/seller | photos, packaging, batch |
| Wrong item | platform coordinates correction at no customer cost | return `wrong_item`; cost bearer seller | order and item photos |
| Scent preference | opened-product policy; not a defect | `changed_mind` within 14 days where eligible | condition |
| Performance complaint | compare listing claim with evidence; misdescription route | `not_as_described`; listing revision requested | usage context |
| Safety complaint | escalate immediately; preserve evidence; suspend listing if needed | P0 ticket; listing suspended; house contacted | product/batch, handled carefully |
| Refused at door | record reason code; allocate cost; offer re-attempt | `refused` transition; stock released | courier code |
| Unreachable | two attempts (courier policy) then refusal | same | attempt log |
