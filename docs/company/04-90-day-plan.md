# 90-day company plan

Not executed here. Evidence and learning over feature count (doc 02). The plan runs the
doc 02 §9 validation sprint on the built product while engineering fixes the money engine
(`docs/product/02-roadmap.md` P0). Owners follow `docs/operations/02`. Each milestone:
objective · dependency · evidence required · success signal · owner · decision unlocked.

## Days 1–30 — decide, fix, map

| Track | Milestone | Dependency | Evidence required | Success signal | Owner | Unlocks |
|---|---|---|---|---|---|---|
| Founders | Founders' agreement discussion completed with counsel; entity path chosen; budget/runway drafted (D-8, D-9, D-10) | counsel engaged | signed discussion acknowledgement; counsel note | dated entries in the register | both founders | everything contractual |
| Legal | Counsel briefed with `docs/legal/03`; answers requested for L1–L8, L10, L14, L17; trademark screening filed (D-1) | entity path | written answers | interim positions replaced | business founder | seller agreement, privacy texts, payout direction |
| Product | Record X1; approve ADR-12 (stop mobile), ADRs 01–14, FD-1..7; set D-2 policy default; D-4 pilot rates with minimum-fee field; D-5 interim invoice arrangement | register | register entries | no unrecorded assumptions in code | both founders | P0 build; seller pitch |
| Engineering | P0 tasks 1–5 (gate-4 tests, ledger, returns reversal, cancel/refuse, stock, idempotency); deployment scaffolding (remote, `main`, CI, staging) | ADR approvals | tests failing then passing; staging URL | all nine states reachable; a sub-order settles once (test) | technical founder | real orders safe |
| Seller acquisition | Map 50 houses (doc 02 §9 week 1) from press lists and social; interview 10; competitor evidence rows with screenshots (T-1) | scorecard | interview notes ranked by evidence | 8 qualified | business founder | pilot cohort |
| Customer research | 15 buyer interviews (doc 02 §7) | — | notes | information gaps ranked | business founder | R1 trust priorities |
| Brand | Photography guide finalised; shoot vendor quoted; descriptor lockup and verified-mark rules proposed | FD-2 | quote; one-page guide | budget line | business founder | onboarding offer |
| Operations | Daily checklist and weekly page started on `/ops/insights`; support rota | — | first weekly page | cadence kept 4 weeks | both | habit |
| Analytics | Unit-economics worksheet created with evidence ranks; North Star and guardrails adopted | — | worksheet file | reviewed weekly | business founder | pilot data plan |

## Days 31–60 — onboard, message, run the first orders

| Track | Milestone | Dependency | Evidence required | Success signal | Owner | Unlocks |
|---|---|---|---|---|---|---|
| Engineering | P0 tasks 6–14 (attribution capture, DB rates + admin screen, SMS adapter, outbox/jobs, notifications v1, checkout OTP + risk flags, API-only reads, observability, production project with PITR); R0 foundations | days 1–30 | staging demo of a full order with messages; Sentry event | launch checklist §11 items ticked | technical founder | real pilot |
| Legal | Seller agreement v1, customer terms, returns, privacy, consent texts drafted from counsel answers; prohibited-claims wording | counsel answers | drafts | first house can sign | business founder + counsel | onboarding, first order |
| Seller onboarding | 3–5 houses: verification with evidence, agreement signed, catalogue entered with photographs (shoot done), test order each, training | agreement; shoot | 8/8 controls; ≥ 5 published listings each | storefronts live; links in bios | business founder | pilot orders |
| Demand | Houses announce their links; founder editorial: 3 pieces; structured data live | catalogue | storefront_view by house | first orders via storefront links | business founder | funnel baseline |
| Operations | Manual courier and remittance run daily; every order watched; exception list by hand | orders | daily checklist | zero silent orders | both | ops lead trigger data |
| Analytics | Funnel and SLA baselines from real orders; refusal reasons recorded | orders | `/ops/insights` | first weekly review with real numbers | business founder | scorecard |

## Days 61–90 — measure, settle, decide

| Track | Milestone | Dependency | Evidence required | Success signal | Owner | Unlocks |
|---|---|---|---|---|---|---|
| Finance | First payout cycle on the ledger with two-person approval; statements accepted; invoices per D-5 interim | ledger; orders past reserve | statements; zero disputes | houses paid/invoiced correctly once | finance owner (business founder) + technical founder as second approver | trust with houses |
| Product | R1 trust layer (verified line, ratings on tiles, trust row, house panel, SMS tracking link); cancel/refuse/return exercised on real orders | R0 | before/after funnel | checkout completion not worse; cross-house views | technical founder | R2/R3 planning |
| Seller | 14-day reviews for each house; monthly business review; second-cohort pipeline (5 more qualified) | first orders | indicators per house | ≥ 3 houses reliable; referrals | business founder | Stage 0 growth |
| Validation | doc 02 §10 scorecard completed: ≥ 50 completed orders, ≥ 3 houses routing, 15 seller + 30 buyer interviews, confirmation/refusal tracked, contribution inputs recorded, cross-brand observed | all | scorecard document | go / revise / SaaS-first / pause | both founders | Phase 1 vs pivot |
| Legal | PDPL compliance checklist against enforcement (~Oct 2026): consent records live, privacy request process, retention confirmed | L10–L13 | checklist | no known gap | business founder | launch beyond pilot |
| Analytics | Unit-economics worksheet with rank-1 evidence for AOV, source mix, refusal, confirmation; A-2 costs entered | orders; PSP/courier quotes | worksheet | contribution path stated (positive or not) | business founder | D-4 final rates |
| Engineering | P1 planning: Paymob and Bosta contracts requested; staff roles (S-1) built if any house has staff | pilot learnings | contracts in progress | P1 backlog evidence-ranked | technical founder | Stage 0 late |

## What the 90 days must not include

Mobile work · warehouse or sampling design · paid campaigns · AI features · English locale ·
sponsored placement · any new dependency without justification · any payout on the old
settlement code.

## Decision gate at day 90 (doc 02 §11)

Proceed to full MVP/pilot expansion · revise wedge · operate as seller SaaS first · pause.
The founders decide with the scorecard, the worksheet and the register in front of them.
