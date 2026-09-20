# AI opportunity map

Each opportunity: user problem · business value · required data · prerequisites ·
complexity (L/M/H) · risk · explainability concern · when justified. Status of data is FACT
as of 18 Sep 2026.

| Opportunity | User problem | Business value | Required data | Prerequisites | Cx | Risk | Explainability | Justified when |
|---|---|---|---|---|---|---|---|---|
| **Search intelligence** (synonyms, transliteration, note queries like "vanilla and oud") | "it doesn't understand what I typed" | discovery → conversion | notes dictionary; house-side naming variants; zero-result counts (no query text stored — A-1) | dictionary built; ≥ 300 SKUs | M | over-broad results | rule-based first; show matched terms | zero-result rate stays high after dictionary |
| **Recommendation** ("from other houses", "similar") | "what else would I like?" | cross-brand purchase (the marketplace proof) | notes, families, bands, co-purchase, reviews | ≥ 20 houses; ≥ 1,000 orders; reviews | M | popularity bias; new-house cold start | "same family, shared notes, higher longevity rating" | Phase 2 once rails by rules underperform |
| **Scent similarity** (our catalogue only) | "something like this one" | discovery; compare | notes dictionary with weights; review language | dictionary; ≥ 500 SKUs | H | implied designer similarity (legal); wrong pairings | show shared notes | Phase 2–3 |
| **Personalised discovery** | "show me my kind" | repeat, AOV | identified history with consent; preferences | D-2 accounts; consent; ≥ 5,000 customers | H | privacy; filter bubbles | "because you bought X" | Phase 2 late |
| **Seller analytics** (what sells, when, to whom in aggregate) | "what should I make/stock?" | seller retention; subscription stream | months of orders per house; source mix | ledger; attribution | M | small-sample noise | plain aggregates first | ≥ 6 months per house |
| **Demand forecasting** (stock-outs, seasonality) | "will I run out before Eid?" | stock-out prevention | ≥ 12 months of orders; stock movements | stock ledger | H | one season of data is not a forecast | ranges, not numbers | ≥ 2 seasons |
| **AI shopping assistant** | "help me choose" | conversion | everything above + policy text | all above; guardrails | H | hallucinated claims in a trust product; legal | must cite listing fields only | Phase 3+, if ever |
| **Conversational perfume discovery** (quiz-like, structured) | "I don't know the words" | first-time conversion | families, occasions, bands | catalogue depth | L (rule-based) | none if rules | fully | Phase 2 as rules, not a model |
| **Catalogue enrichment** (assist entry: suggest notes from a description, normalise names, flag missing fields) | "publishing takes long" | faster onboarding; data quality | vocabularies; existing listings | human review of every suggestion | L–M | wrong facts published | suggestion, never auto-publish | now, as assistance to founders/category manager |
| **Operational automation** (ticket triage, reply drafts, exception summaries) | ops time | ops capacity | tickets, timelines | ticket volume; macros first | M | wrong promises to customers | human sends | > 15 tickets/day |
| **Fraud/risk detection** (fake COD orders, refusal patterns, review clusters) | losses, trust | refusal cost; review integrity | refusals with reasons; phone history; review timing | reason codes; verification | M | unlawful/opaque blocklists (doc 06 §7) | flags with reasons; person decides | ≥ 500 dispatches |

## Cross-cutting prerequisites

The notes dictionary · attribution live · ledger live · consent records · review volume ·
an evaluation harness (offline metrics against held-out orders) · an off switch per feature.
