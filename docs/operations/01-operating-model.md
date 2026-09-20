# Operating model

Doc 06 is the operations playbook (DOCUMENTED). This model places it in a company: who
owns what, how work flows, what is manual by design, and how the model changes with growth.

## 1. Operating standard (DOCUMENTED, doc 06)

The platform owns the customer experience even when the seller owns inventory and
fulfilment. "The seller made the mistake" is an internal cause, not an acceptable customer
answer.

## 2. Value streams

| Stream | Trigger | Steps | Owner | System support (FACT / target) |
|---|---|---|---|---|
| Supply | a lead | qualify → apply → verify → contract → catalogue → train → launch → review at 14 d | business founder → ops | intake, checklist, moderation (FACT); evidence bucket (target) |
| Catalogue quality | a listing submitted or changed | gaps → claims → moderation → publish → revision audit | category manager | gate, scanner (FACT); notes dictionary (target) |
| Order operations | an order placed | handoff → confirm → dispatch → deliver/refuse → remit → reconcile | ops lead | queue, clocks (FACT); notifications, SLA jobs, refuse/cancel, reconciliation (target) |
| Customer support | a ticket or exception | triage by category → answer → consult house → resolve with code | ops lead | support queue (FACT); customer timeline, SLA timers (target) |
| Returns and refunds | a request | decide → receive → refund with bearer → ledger → notify | ops → finance | lifecycle (FACT); ledger link (target) |
| Finance | a period end | reconcile → draft payouts → second-person approval → pay → statements → disputes | finance owner + admin | payout run (FACT, defective C1); ledger, approval, reconciliation (target) |
| Trust and enforcement | an indicator threshold or a report | coaching → warning → restriction → suspension → termination | ops + business founder | indicators (FACT); enforcement screens (target) |
| Marketing and merchandising | a plan | content → campaigns with attribution → creator codes → featured by indicators | business founder | CMS, curation (FACT); attribution (target) |
| Analytics | weekly/monthly cadence | definitions → `/ops/insights` → written review | business founder (definitions), tech (computation) | insights (FACT) |
| Compliance | a request, a law change, an incident | privacy requests → retention → breach process → policy updates | compliance owner + counsel | consent/privacy tables (unused, FACT) |
| Security and reliability | an alert | contain → assess → fix → record | technical founder | none today (target: `docs/architecture/09`) |

## 3. Where manual work is acceptable (pilot), justified later, never at scale

| Activity | Pilot (≤ 5 houses) | Growth (5–50) | Never manual at scale |
|---|---|---|---|
| Seller qualification and verification review | manual, founder | manual with checklist screens | evidence storage, checklist enforcement (already automatic) |
| Catalogue entry | assisted by founders | seller self-serve with moderation | publish gate, claims scan (automatic) |
| Order confirmation | house | house | handoff, clocks, notifications |
| Courier booking and tracking | house types tracking number | Bosta booking | tracking events, delivery outcomes |
| COD remittance entry | operator types amount | courier statement import | matching remittance to COD amount |
| Payout run | admin clicks with second approval | scheduled draft, approval | settlement uniqueness, statement generation |
| Refund execution | manual bank/wallet transfer, recorded | PSP refund API for card | ledger posting |
| Support answers | founders | ops lead + macros | ticket routing, priority, timers |
| Exception detection | founder scans queues | daily report | SLA breach detection |
| Review moderation | manual | manual | gating (automatic) |
| Analytics | `/ops/insights` | same + monthly review | definitions and computation |

## 4. Escalation model

Level 1 ops lead (founders at pilot) → Level 2 business founder (commercial/policy) or
technical founder (system/security) → both founders for money, policy, suspension,
non-standard terms (doc 05 §7) → counsel/accountant for legal and tax. Security incidents:
technical founder contains immediately and informs the other founder without delay (doc
05 §7).

## 5. Interfaces with partners

Courier (booking, tracking, COD remittance statements, failed-attempt charges) · PSP
(settlement reports, refunds) · SMS/WhatsApp (delivery receipts, opt-outs) · counsel and
accountant (policies, tax, PDPL) · trademark agent (D-1).

## 6. Operating principles

Every decision that moves money has a second person and an audit entry · every customer
message names the next step · no generic reason codes (doc 06 §7) · no manual balance
adjustment without reason, approver and evidence (doc 06 §12) · definitions before
dashboards · manual today is fine if the system records it.
