# Automation strategy

Doc 01 §7: "manual operations where necessary; premature automation of unproven workflows"
is a non-goal. This strategy says which workflows are proven enough to automate, in what
order, and which must never depend on a person at scale.

## 1. Already automatic (FACT) — keep

Publish gate and claims scan · verification go-live gate · order fan-out and handoff · SLA
clocks · pricing on the server · review gating · audit entries inside decisions · RLS
isolation · rate limits (in-process) · media verification.

## 2. Automate before pilot (P0) — because a person cannot do these reliably even once

| Workflow | Why now |
|---|---|
| Settlement uniqueness (ledger) | a person cannot remember what was paid (C1) |
| Notifications on every transition | silence is the failure mode of a marketplace |
| SLA breach detection and pre-breach alerts | the queue is only read when opened |
| Reserve release and purges (scheduler) | nobody runs a nightly task by hand |
| Idempotent placement, stock reservation | double orders and oversell are not ops problems |
| Error capture and alerts | blindness |

## 3. Automate in growth (P1–P3) — when the manual version is measured

| Workflow | Manual until | Automate when |
|---|---|---|
| Courier booking and tracking | house types a number | > 30 orders/day or tracking questions > 10 % of tickets |
| COD remittance matching | operator types amounts | courier statements available as files/API |
| Card refunds | manual transfer, recorded | PSP live |
| Payout drafting | admin clicks | > 10 houses per cycle |
| Daily exception report | founder scans | day one of the ops lead |
| Support routing and macros | founders | > 15 tickets/day |
| Catalogue normalisation (notes dictionary matching) | manual mapping | > 300 SKUs |
| Review cluster detection | manual look | > 100 reviews/month (`docs/ai/`) |

## 4. Never manual at scale

Money settlement · order state transitions · stock · attribution decisions · notifications ·
retention purges · verification gates · audit.

## 5. Never automated without a person

Seller approval and termination · refunds above threshold · payout approval (second person)
· review removal · claims policy judgement calls · risk decisions on customers (doc 06 §7: no
opaque automated blocklists) · rate changes.

## 6. Automation rules

Every automated job is idempotent and recorded (`job_runs`) · every automated decision that
affects money or a house is auditable · a kill switch exists per integration · automation
is introduced only after the manual version has produced the data that defines "correct".
