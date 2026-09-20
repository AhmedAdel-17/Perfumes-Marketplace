# Operating cadence

Doc 06 §13 sets daily/weekly/monthly/quarterly reviews (DOCUMENTED). This cadence adds the
incident, seller-review and financial rhythms, and names the screen or artefact for each.

## Daily (operations lead; founders at pilot) — 30 minutes, morning Cairo time

| Check | Source (FACT / target) | Action |
|---|---|---|
| Unconfirmed orders past or near SLA | seller SLA table; exception report (target) | contact house; cancel `seller_unresponsive` after policy window |
| Late dispatch | same | contact house |
| Delivered, not remitted > 7 d | ops work queue (FACT) | chase courier statement |
| Payment exceptions (once PSP) | payment events (target) | reconcile |
| P0/P1 tickets | support queue (FACT) | answer within doc 06 §9 targets |
| Failed integrations / jobs | alerts (target) | technical founder |
| Returns waiting on a decision | returns board (FACT) | nudge house / decide |

## Weekly (both founders) — 60 minutes

Seller SLA per house · cancellations/refusals with reasons · complaints · contribution
inputs status · campaign attribution (when any) · top search gaps (zero-result counts) ·
North Star and guardrails (`docs/analytics/01`) · pipeline of houses · one written page.

## Monthly (both founders + accountant)

Seller business review (each house: indicators, statement, next step) · customer cohorts
(90-day repeat, cross-brand, direct return) · payout audit (every payout: approver, lines,
disputes) · catalogue quality (missing photos, unsourced bands, stale stock) · risk and
compliance (privacy requests, incidents, claims refusals) · roadmap evidence (doc 04 §9
change control for anything proposed) · unit economics worksheet update
(`docs/economics/02`).

## Quarterly (founders + counsel)

Commercial terms and fee model (D-4) · courier and PSP performance and contracts · legal
policy review (returns, claims, PDPL) · data retention review · strategic phase gates (doc
04 §7) · founder agreement review (doc 05 §2 "revisit terms when facts change").

## Incident cadence (technical founder)

Detect (alert) → contain within the hour → inform the other founder immediately → customer
and house communication if affected within the day → post-incident note within 48 h
(cause, fix, prevention) → recorded in the audit/ops log. Security incidents follow doc 05
§7 (containment authority).

## Seller review cadence

14-day launch review (doc 06 §2) → monthly business review → quarterly terms review.
Enforcement steps (doc 06 §11) happen as thresholds trigger, not on the calendar.

## Financial review cadence

Weekly cash position (COD outstanding by house, PSP settlements) · payout cycle per policy
(cadence OPEN, SL-4) with two-person approval · monthly reconciliation of courier statements
to COD amounts and of PSP reports to captures · monthly statement disputes review ·
quarterly accountant review (tax, invoicing model per D-5).

## Artefacts

One weekly page · one monthly review deck (text) · `/ops/insights` as the shared source ·
the unit-economics worksheet · the decision register (`docs/company/03`).
