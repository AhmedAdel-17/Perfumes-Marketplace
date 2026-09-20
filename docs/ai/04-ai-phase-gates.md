# AI phase gates

## DO NOT BUILD YET — and why

| Capability | Why not now |
|---|---|
| Scent-matching or similarity model | doc 04 §10 defers it; no dictionary, no reviews, three products; any model would learn nothing and imply designer similarities (legal L8) |
| Personalised recommendations | no accounts (D-2), no consent records, no volume; rails by rules ("same family", "from other houses") are the honest version |
| AI shopping assistant / chat | a trust product cannot afford invented claims; policy text unreviewed by counsel; no evaluation harness |
| Demand forecasting | one season of pilot data is not a forecast; stock movements do not exist |
| Automated fraud blocklists | doc 06 §7 forbids opaque automated blacklists; flags need refusal history first |
| Auto-moderation of listings/reviews | moderation decisions must be auditable and coded; a scanner exists; a model would remove the reason |
| AI-generated product descriptions or images | claims risk; photography ownership rules; brand voice |

## Gates (each unlocks the next tier)

| Gate | Condition | Unlocks |
|---|---|---|
| G0 | notes dictionary built and used by search; ≥ 300 SKUs | search intelligence (rules + dictionary), catalogue enrichment assistance under human review |
| G1 | ≥ 1,000 completed orders across ≥ 20 houses; reviews ≥ 20 % of earned; attribution live | rule-based recommendation rails evaluated; review-integrity flags; seller aggregate analytics |
| G2 | consent records live; D-2 accounts; ≥ 5,000 identified customers; PDPL questions L10–L13 answered | personalised discovery experiments with explanations |
| G3 | ≥ 500 SKUs with dictionary notes; evaluation harness; counsel sign-off on similarity language | scent similarity within our catalogue |
| G4 | ≥ 2 seasons; stock ledger | forecasting ranges for houses |
| G5 | ticket volume > 15/day; macros in place | support drafting assistance (human sends) |
| G6 | all above; brand and legal review of conversational guardrails | conversational discovery beyond rules |

## Review

Gates are checked at the quarterly strategy review (`docs/operations/03`). An AI proposal
without a gate reference is returned.
