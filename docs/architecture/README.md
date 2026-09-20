# Architecture package — 18 September 2026

Produced by the full-system audit (ingestion → reverse engineering → audit → target →
gap analysis → frontend audit → roadmap → CTO decision). No production code was modified.

| File | Phase | Contents |
|---|---|---|
| `00-ingestion/PROJECT_STRUCTURE.md` | 0 | repo layout, package graph, routes, tooling, environments |
| `00-ingestion/CURRENT_TECH_STACK.md` | 0 | installed stack vs intended stack |
| `00-ingestion/CURRENT_CAPABILITIES.md` | 0 | what each role can do today, with gaps |
| `00-ingestion/CURRENT_ASSUMPTIONS.md` | 0 | assumptions in code and docs; conflicts between them |
| `01-current-architecture.md` | 1 | system/backend/frontend/DB as built; 28 flow traces; sequence diagrams |
| `02-target-architecture.md` | 3 | greenfield target: modular monolith, use-cases, outbox, jobs, integrations, business model |
| `03-architecture-decisions.md` | 3–4 | fifteen ADRs, with which need founder approval |
| `04-gap-analysis.md` | 2 + 4 | audit findings with severity and action; component gap table; the CONTINUE + MAJOR REFACTOR decision |
| `05-security-architecture.md` | 3 | auth, RBAC matrix, least privilege, secrets, PDPL, abuse |
| `06-data-architecture.md` | 1 + 3 | ER diagrams current and target; ledger; order/payment/payout state models |
| `07-api-architecture.md` | 3 | tRPC + REST boundaries, idempotency, pagination, versioning |
| `08-order-payment-payout-flows.md` | 1 + 3 | money defects precisely; target flows; gate-4 reconciliation table; the D-5 fork |
| `09-observability.md` | 3 | correlation, logs, errors, metrics, alerts with owners |
| `10-infrastructure.md` | 3 | environments, CI/CD, jobs, backups, rollback, launch checklist |
| `../frontend/01-ux-audit.md` … `04-redesign-plan.md` | 5 | UX/UI/trust audit; design system; frontend architecture; redesign plan |
| `../product/01-mvp-readiness.md` … `03-technical-debt.md` | 6 | gates honestly; roadmap P0–P5 and the next 30 tasks; full debt register |

Executive summary: see the CTO report delivered with this package (chat), or read
`04-gap-analysis.md` Part 3 and `product/02-roadmap.md` P0.
