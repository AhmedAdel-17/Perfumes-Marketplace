# AI data prerequisites

What each learned capability needs, whether it exists (FACT), and the non-AI step that
creates it. The pattern is consistent: **every prerequisite is also a product improvement
worth doing on its own.**

| Prerequisite | Exists today | Created by | Used by |
|---|---|---|---|
| Controlled vocabularies (families, concentration, bands, occasions) | yes (FACT, closed enums) | — | search, recommendation, quiz |
| Notes dictionary (canonical Arabic/Latin, synonyms, tiers, weights) | no — free-text arrays | category management work; enrichment assistance | search, similarity, recommendation |
| Performance bands with source; review-aggregate bands | source yes; aggregate no | review volume + threshold decision | recommendation, honest ranking |
| Verified reviews (six dimensions, text) | schema yes; volume zero | review request messages; pilot orders | similarity, integrity, ranking |
| Attribution touches and decisions | designed; inert | ADR-07 | seller analytics, campaign models |
| Ledger and outcomes per order (delivered, refused, returned) | partial; states unreachable | P0 correctness | forecasting, risk |
| Stock movements | no | ADR-06 | forecasting |
| Identified purchase history with consent | phone-keyed orders; no consent records | D-2, consent texts | personalisation |
| Anonymous browsing events (no text) | yes (FACT, 180 d) | — | funnel, search intent counts |
| Ticket corpus with resolution codes | schema yes; volume low | ops | operational automation |
| Refusal history with reason codes | no | P0-3 | risk flags |
| Evaluation data (held-out orders, labelled duplicates, labelled clusters) | no | manual labelling during moderation | all models |

## Data volumes that make learning meaningful (ASSUMPTIONS, to revisit)

Search/dictionary: ≥ 300 SKUs · similarity: ≥ 500 SKUs with dictionary notes ·
recommendation: ≥ 1,000 orders across ≥ 20 houses · personalisation: ≥ 5,000 identified
customers · forecasting: ≥ 2 seasons · risk: ≥ 500 dispatches with outcomes.

## Data we will never use for AI

Search query text (not stored) · customer identity in browsing · scraped competitor data
· designer-name similarity labels · reviews from non-delivered orders.
