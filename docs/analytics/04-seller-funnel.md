# Seller funnel

Mirrors `docs/seller-experience/02`. Denominators are houses in the stage during the
period. Evidence ranks follow doc 02 §3.

| Stage | Metric | Source | Diagnostic cuts |
|---|---|---|---|
| Leads | leads by segment (S1–S4) and source (founder outreach, referral, inbound) | CRM sheet (manual at pilot) | — |
| Qualified | qualified ÷ leads; scorecard distribution | scorecard | segment |
| Applied | applications ÷ qualified; days lead → application | `applications` (FACT) | — |
| Under review | days in review; controls approved/8 | verification rows (FACT) | which control stalls most |
| Approved / contracted | approved ÷ applied; days | status | non-standard terms count |
| Catalogue ready | listings published per house; gaps per listing; photos per listing; moderation returns per listing | listings (FACT) | which field is missing most |
| Live | approved → live days | status | — |
| Activated | first completed order within 14 d ÷ live | orders | segment |
| Reliable | confirmation on time, dispatch on time, refusal rate vs median | SLA table (FACT) | house |
| Paid | statements issued; disputes | payouts (after ledger) | — |
| Retained (90 d) | active at 90 d ÷ live 90 d ago | orders | segment |
| Growing | attributed marketplace orders per house per month; SKUs added | attribution (after capture) | — |
| Warned / suspended / exited | counts with reason codes | status + audit | reason |

## Questions the seller funnel answers

- Which segment converts and stays? (doc 02 §11 "revise wedge")
- Where does onboarding stall — documents, photographs, or training?
- Do houses keep the bio link (rank 2 evidence of routing)?
- Is the low fee sustainable per house (contribution by house)?
- Which houses earn merchandising eligibility by indicators?

## Pilot targets (doc 02 §10, DOCUMENTED)

≥ 3 houses routing live traffic; 15 seller interviews across ≥ 3 types; confirmation rate
and time tracked; refusal reasons tracked by house and buyer.
