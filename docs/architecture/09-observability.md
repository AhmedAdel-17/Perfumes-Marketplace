# 09 — Observability

Doc 04 §5: "central logs, errors, order/payment/courier correlation and alert ownership."
Doc 06 §1: platform availability and incidents are the technical founder's accountability.
Today there is none of this (two `console.error` calls). This is the minimum before a pilot.

## 1. Correlation

- `request_id` (UUID) generated in Next middleware for every request, propagated into the
  tRPC context, every log line, every Sentry event, `audit_log.request_id` and
  `ledger_entries.request_id`.
- Business keys on every log line where known: `order_ref`, `sub_order_ref`, `seller_id`,
  `payout_ref`, `job`, `run_key`, `provider_event_id`. Never a full phone number (hash it).

## 2. Logs

- Structured JSON to stdout (a thin `log()` helper in `packages/api`; no framework needed
  beyond that). Levels: `info` for use-case outcomes and job runs, `warn` for policy
  refusals worth counting (rate limit hit, stock unavailable, illegal transition attempted),
  `error` for anything unexpected.
- Shipped by Vercel log drain to Axiom (free tier is enough) or Better Stack; 30-day
  retention.
- Never log: OTP codes, cookies, tokens, full addresses, PSP payloads (store those in
  `payment_events`, not logs).

## 3. Errors

- Sentry (`@sentry/nextjs`) on server and client, environment-tagged, release = git SHA,
  PII scrubbing on. Unknown errors in `errors.ts` call `captureException` with the request
  id and return a generic Arabic message that **includes the request id** so support can
  find the event.

## 4. Metrics (derived from the database, not a metrics vendor, at this stage)

A `metrics` view set queried by `/ops/insights` and by the alert job:

| Metric | Definition | Alert |
|---|---|---|
| Orders placed / hour | count | none |
| Unconfirmed past SLA | `awaiting_seller ∧ now > confirm_due_at` | > 0 → house + ops |
| Dispatch breaches open | `confirmed ∧ now > dispatch_due_at` | > 0 → house + ops |
| Delivered, not remitted > 7 d | COD | daily report |
| Outbox backlog | undispatched rows older than 5 min | > 0 → ops (pager) |
| Job failures | `job_runs.result = 'failed'` last 24 h | any → technical founder |
| Webhook errors | `payment_events`/`shipment_events` with processing error | any |
| Remittance mismatch | `collected ≠ cod_amount` today | any |
| Error rate | Sentry 5-min error count | > 5 → technical founder |
| p95 latency: product page, search, `orders.place` | Vercel analytics | > 2.5 s LCP throttled → weekly review |

## 5. Business events

Already exist in two forms and are kept: `analytics_events` (browsing, anonymous) and
`sub_order_transitions` + `audit_log` (operational). The outbox adds the third: domain
events with timestamps, which the owner report may aggregate. The doc 04 §6 taxonomy maps:

| Doc 04 event | Source of truth |
|---|---|
| landing_view … checkout_start | `analytics_events` |
| order_place, order_confirm, seller_accept/reject, dispatch, delivered, refused, returned | `sub_order_transitions` |
| review_submit, reorder, direct_return, cross_brand_purchase | orders/reviews tables, computed in `insights` |
| listing_publish, stockout, SLA_breach, payout_complete | outbox events |
| source_attributed, campaign_click | `attribution_touches` |

## 6. Tracing

Not justified yet. One process, one database. Sentry's transaction tracing at 10 % sampling
gives DB query timings for free; revisit when a second runtime exists.

## 7. Dashboards

- `/ops/insights` (exists) — funnel, SLA, contribution inputs, source mix; add money from
  the ledger and the exception list.
- Sentry issues; Axiom saved queries per `order_ref`.
- Supabase dashboard for connections, slow queries, disk.

## 8. Alert ownership (doc 06 §1)

| Alert | Owner | Channel |
|---|---|---|
| Availability, error rate, job failures, webhook backlog | technical founder | WhatsApp + email |
| SLA breaches, remittance mismatch, exception report | operations lead (business founder at pilot) | WhatsApp digest |
| Payout run failed / ledger constraint violation | finance owner (business founder at pilot) + technical founder | immediate |
| Security (rate-limit storms, admin sign-in from new device) | technical founder | immediate |

Every alert names its owner in the job definition; an alert without an owner is not created.
