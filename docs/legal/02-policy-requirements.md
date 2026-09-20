# Policy requirements

The documents the company must have, what each must cover, where it is surfaced in the
product, and its current state (FACT). Wording of every customer- or seller-facing policy
awaits counsel; the product already publishes draft pages through the CMS (FACT: about,
terms, returns, privacy, care).

| Policy | Must cover | Surfaced in product | State |
|---|---|---|---|
| Customer terms | who contracts with whom (platform vs house), COD terms, cancellation before dispatch, delivery windows as estimates, disputes, governing law | checkout consent line; footer; confirmation message | draft page exists; unreviewed |
| Returns and refunds | windows by reason (law + policy), sealed/opened rules, who pays return shipping, refund method and timing for COD and card, defect route | product page eligibility; tracking return panel; returns page | draft page; domain windows 14/30 (FACT); counsel pending |
| Privacy notice (PDPL) | controller identity, data collected, purposes, lawful bases, retention (incl. 180-day browsing proposal), sharing with houses/couriers/PSP/SMS, cross-border storage, rights and how to exercise, cookies | privacy page; checkout; analytics cookie disclosure | draft page says 180 days (FACT); process unbuilt |
| Consent texts | order fulfilment (contract), marketing opt-in per channel, review submission | checkout, review form, opt-in prompts | `consent_records` unused (FACT) |
| Seller agreement | fees and fee model, attribution windows and dispute procedure, SLAs, claims and prohibited products, photography and ownership warranties, returns and cost allocation, data use, statements and dispute deadline, suspension ladder, termination and final payout, IP/licence of house content, liability | application terms preview (FACT); signature step (target); portal help | not drafted |
| Prohibited products and claims | category boundaries (D-6), inspired-by rules, designer references, percentage-similarity, safety claims, required label data | listing form, claims scanner, moderation reasons | scanner vocabulary exists (FACT); policy text not drafted |
| Review policy | verified-only, no seller deletion, incentive disclosure, moderation grounds, author masking | review form; product page; moderation | rules built (FACT); text not drafted |
| Sponsored placement and creator disclosure | labelling, separation from organic ranking, creator obligations | labels; creator terms | not needed until Phase 2; label rule recorded |
| Support standard | priorities and targets (doc 06 §9), one route | support page | draft "care" page exists |
| Seller staff and access | roles (S-1), owner responsibility for staff actions | staff screen | not drafted |
| Data retention schedule | per data class | internal + privacy notice | proposed in `docs/data/04` |
| Incident and breach procedure | detection, containment, notification timelines per PDPL | internal | not drafted |
| Payout and invoicing policy | direction (D-5), cadence, reserve, dispute window, statement contents, VAT | seller portal money pages | reserve/dispute defaults exist as data (FACT) |
| COD and failed-delivery policy | verification rules by risk, reason codes, cost allocation, repeat-refusal handling without automated blocklists (doc 06 §7) | checkout, ops actions, seller agreement | codes exist; policy not drafted |
| Photography and content licence | house grants platform a licence to display; ownership warranty | photo upload confirmation (FACT) | wording pending |

## Drafting order (RECOMMENDATION)

1. Founders' agreement and entity (everything else needs a signatory).
2. Seller agreement + prohibited products/claims + payout policy (before the first pilot
   house signs).
3. Customer terms + returns + privacy + consent texts (before the first real order).
4. Review, support, COD policies (before launch day — doc 06 §14 checklist).
5. Sponsorship/creator, staff (Phase 2).
