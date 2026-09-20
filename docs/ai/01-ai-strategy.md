# AI strategy

Doc 04 §10 explicitly defers "complex AI scent matching without sufficient preference and
purchase data". This strategy respects that and answers a narrower question: **where would
learned systems create value for this business, on what data, and when would each become
justified?** No AI is built in this phase.

## 1. Principles

1. **Data before models.** Every opportunity in `02` lists the data it needs; the
   prerequisites in `03` say whether that data exists. Today the answer is almost always
   "not yet" (FACT: three seeded products, zero reviews, attribution inert).
2. **Structure beats inference.** A notes dictionary, controlled vocabularies and bands
   with sources make most "AI search" unnecessary at this scale; they are also what any
   later model would be trained on.
3. **Explainable, sourced, honest.** A recommendation says why ("same family, similar notes,
   rated higher for longevity by verified buyers"). Never a black box in a trust product;
   never a designer-name similarity (legal).
4. **Privacy by design.** No customer-identified behavioural modelling before consent
   records and PDPL confirmation; anonymous, aggregate first.
5. **Humans decide money, trust and enforcement.** Fraud/risk models flag; people decide
   (doc 06 §7).
6. **Operational AI before customer-facing AI.** Catalogue enrichment assistance and
   support drafting help the founders first and fail safely.

## 2. Value hypotheses (HYPOTHESES, ordered by earliest justification)

| Order | Opportunity | Why first |
|---|---|---|
| 1 | Catalogue enrichment assistance (notes normalisation, Arabic/Latin naming, gap suggestions) | founders do this by hand now; low risk; builds the dictionary |
| 2 | Search intelligence (synonyms, spelling, note-based queries) | extends the existing Arabic normalisation with a dictionary; explainable |
| 3 | Review integrity signals (clusters, timing anomalies) | protects the second asset; flags only |
| 4 | Similar perfumes by *our* notes and bands | needs dictionary + reviews; explainable; no designer names |
| 5 | Personalised discovery | needs identified history with consent; Phase 2+ |
| 6 | Seller analytics and demand forecasting | needs months of orders per house |
| 7 | Conversational discovery / shopping assistant | needs all of the above; hallucination risk in a trust product |
| 8 | Operational automation (support drafting, exception triage) | valuable once ticket volume exists |
| 9 | Fraud/risk detection on COD | flags only; needs refusal history |

## 3. Explicit "do not build yet" — see `04-ai-phase-gates.md`

## 4. Governance

An AI feature enters the roadmap only with the doc 04 §9 fields plus: data source and
lawful basis, explanation shown to the user, evaluation metric with a baseline, failure
mode and off switch, owner. Recorded in `docs/company/03-decision-register.md`.
