# Trigger conditions

A change is justified when its trigger is **measured**, not predicted. Each trigger names
the metric, the threshold (ASSUMPTION, to calibrate), the change it unlocks, and what to
try first (the cheaper alternative).

## Architecture

| ID | Trigger | Metric / threshold | Unlocks | Try first |
|---|---|---|---|---|
| T1 | Job latency or volume | outbox backlog > 5 min at p95 for a week, or > 10⁴ jobs/day | worker host with pg_boss | more frequent cron; batching |
| T2 | Read load from insights/exports | insights queries > 20 % of DB CPU or p95 > 3 s | read replica | materialised daily aggregates |
| T3 | Search quality/latency | search p95 > 800 ms or zero-result rate > 10 % after dictionary | FTS → search service | trigram index; dictionary; synonyms |
| T4 | Hot-read DB pressure | DB CPU > 60 % sustained from catalogue reads | edge/app cache | ISR + CDN tags |
| T5 | Integration isolation | courier polling or notification sends block web latency, or need > 60 s runtime | extracted runtime | job batching on worker |
| T6 | Table growth | orders/sub-orders > 10⁷ rows or vacuum/index bloat visible | partitioning, archival | indexes; archival of events |
| T7 | Organisational | > 2 engineering teams deploying independently | internal event bus | outbox + shared package |
| T8 | Mobile | doc 03 §10: repeat direct usage proves installation improves retention; e.g. > 30 % of orders from returning customers on web with push-worthy events | native apps | PWA + SMS/WhatsApp links |
| T9 | Warehouse | order density per area and fast-mover data prove consolidation economics (doc 03 §10) | selected inventory | platform courier account; consolidation offers by houses |
| T10 | Second courier / PSP | courier or PSP SLA misses > threshold for a month; single-vendor risk | adapter for a second provider (ports exist) | contract escalation |

## Organisation

| ID | Trigger | Unlocks |
|---|---|---|
| O1 | > 15 tickets/day or first-response target missed 3 days in a week | operations lead / support hire |
| O2 | > 10 onboardings/month or founder onboarding time > 50 % | seller success hire |
| O3 | > 20 houses per payout cycle or reconciliation > 1 day/week | finance role |
| O4 | > 300 SKUs or catalogue quality report shows > 10 % unsourced/missing | category/content editor |
| O5 | P0/P1 roadmap not deliverable by one engineer within the 90-day plan | second engineer |
| O6 | PDPL registration/DPO required (L11) | compliance officer (may be external) |

## Product

| ID | Trigger | Unlocks |
|---|---|---|
| P1 | ≥ 3 houses per family and reviews exist | comparison, category campaigns |
| P2 | direct return and cross-brand measured positive for a quarter | Phase 2 growth features (loyalty readiness, referral) |
| P3 | seller tools requested by > 30 % of houses in monthly reviews | subscription tier experiments |
| P4 | sampling demand evidenced (interviews, decant-seller signals) and Phase 3 economics positive | sampling (Phase 4) |

## Review

Triggers are reviewed at the monthly cadence; a change made without its trigger is recorded
in the decision register as an exception with its reason.
