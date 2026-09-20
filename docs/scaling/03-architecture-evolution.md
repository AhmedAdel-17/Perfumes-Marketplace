# Architecture evolution

From the audited current state (`docs/architecture/01`) through the target
(`docs/architecture/02`) to the shapes later stages may need. Each step names the trigger
in `04-trigger-conditions.md`; without the trigger, the step is not taken.

```mermaid
flowchart LR
  A0[Today: one Next.js process<br/>PGlite dev · no jobs · no integrations] --> A1[Target Stage 0: modular monolith<br/>Vercel + Supabase + R2 · outbox · cron jobs · ledger · Paymob · Bosta · SMS · Sentry]
  A1 -->|T1 job latency or volume| A2[Worker host running pg_boss<br/>same packages, second entry point]
  A1 -->|T2 read load on insights| A3[Read replica for insights and exports]
  A1 -->|T3 search p95 or zero-result rate| A4[Postgres FTS + dictionary → search service]
  A1 -->|T4 DB CPU bound on hot reads| A5[Edge/app cache for catalogue APIs]
  A2 -->|T5 courier polling or notifications need isolation| A6[Extracted runtime: notifications / courier sync<br/>same domain package, own deploy]
  A3 & A5 -->|T6 order table growth| A7[Partitioning and archival]
  A6 -->|T7 multiple runtimes + teams| A8[Internal event bus (broker) with the outbox as producer]
```

## Rules for every step

- The domain package stays one package; extraction is by **runtime need** (long-lived
  processes, isolation, scaling profile), never by "domain fashion".
- RLS and the actor model remain the security boundary in every runtime.
- The outbox remains the only producer of side effects; a broker, if ever, consumes it.
- Every extracted runtime keeps the same observability contract (request id, order ref).
- Forward-only, expand/contract migrations at every stage (ADR-13).

## What we will not do at Stage 0–1

Microservices per domain · GraphQL · a second backend framework · Redis before a measured
need · a data warehouse before `/ops/insights` fails a founder question twice · Kubernetes.
