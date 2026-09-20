# Growth stage model

Per stage: product complexity, data volume, traffic, database, search, caching, queues,
integrations, observability, team, operations, fulfilment, support, finance, mobile,
warehouse, service boundaries. Orders of magnitude are ASSUMPTIONS for planning, not
targets.

| Dimension | Stage 0 (0–100 houses) | Stage 1 (100–1,000) | Stage 2 (1,000–10,000) | Stage 3 |
|---|---|---|---|---|
| Product complexity | shopfront, portal, console; COD + card; manual/Bosta courier | self-serve listing at volume; campaigns; creator codes; seller analytics; CRM | seller subscription tools; sampling; selected inventory; multi-category questions | not designed |
| Data volume | thousands of orders; hundreds of SKUs | 10⁵ orders/yr; 10⁴ SKUs | 10⁶ orders/yr; 10⁵ SKUs | — |
| Traffic | thousands of visits/day | 10⁵/day; campaign spikes | 10⁶/day | — |
| Database | one Supabase Postgres with RLS; PITR | same, larger compute; read replica for insights | partitioned order tables; replicas; archival | sharding questions |
| Search | Postgres LIKE + normalisation (FACT) → trigram index | Postgres FTS + dictionary | dedicated search service (Meilisearch/OpenSearch) if p95 > target | — |
| Caching | ISR for product/house pages; CDN | + edge caching of catalogue APIs | + application cache (Redis) if DB CPU bound | — |
| Queues/jobs | outbox + cron-triggered idempotent jobs (ADR-04) | pg_boss on a worker host when latency < 1 min matters | dedicated workers; possibly a broker | — |
| Integrations | SMS, R2, manual courier → Paymob, Bosta | second courier, WhatsApp, ETA e-invoicing, accounting export | logistics aggregators, marketplaces as channels? (OPEN) | — |
| Observability | Sentry, logs, 4 alerts (target) | metrics vendor, dashboards per function, on-call rota | SLOs, tracing | — |
| Team | 2 founders (+ ops lead late) | 6–12: ops, seller success, finance, content, 2–3 engineers, growth | 25–60: functions, leads, data, compliance | — |
| Operations | founders; daily checklist | ops function; shifts for support; exception automation | regional ops; seller tiers | — |
| Fulfilment | house-booked; platform courier account | platform courier default; consolidation experiments | selected inventory / warehouse **if** density proves it (doc 03 §10) | — |
| Support | founders → one lead | team with macros and timers | tiered support; self-serve help; house support role (S-1) | — |
| Finance | manual reconciliation on the ledger; monthly accountant | daily reconciliation; PSP/courier imports; VAT/e-invoicing automated | finance team; audit-ready ledger exports | — |
| Mobile | none (deferred) | PWA/notifications; native only on retention evidence (doc 03 §10) | native apps if justified | — |
| Warehouse | none | none unless order density (doc 03 §10) | selected inventory | — |
| Service boundaries | one deployable + jobs route | one deployable + worker host | extract by runtime need (courier polling, search indexing, notifications) — not by domain fashion | — |

## What each stage must prove before the next

Stage 0 → 1: the doc 02 §11 gates (routing, completion, economics, cross-brand) and the
MVP definition in `docs/product-strategy/01` §14. Stage 1 → 2: positive contribution at
scale, repeat/direct traffic (doc 04 Phase 2 exit), operations cadence met with a team.
Stage 2 → 3: a documented case for a new category or country (doc 04 §10 defers
international).
