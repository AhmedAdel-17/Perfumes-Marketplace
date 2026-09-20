> **Superseded 18 September 2026** by the canonical root-level `DECISION_REGISTER.md`, which incorporates this register and adds the red-team decisions (DR-01..DR-12). This file is kept as the blueprint snapshot; record new decisions in the root file.

# Master decision register

Classes: **FOUNDERS MUST DECIDE** (doc 04 §9: economics, customer policy,
security-critical architecture, or doc 05 §7 unanimous matters) · **LEGAL MUST DECIDE**
(counsel/accountant/PSP/regulator) · **TECHNICAL TEAM CAN DECIDE** · **PRODUCT TEAM CAN
DECIDE** · **DEFER**. Confidence is the blueprint's confidence in its recommendation.
Existing IDs from `OPEN_DECISIONS.md` and the architecture ADRs are kept.

| ID | Decision | Why it matters | Options | Trade-offs | Recommendation | Confidence | Evidence | Depends on | Reversible? | Owner | Deadline |
|---|---|---|---|---|---|---|---|---|---|---|---|
| D-8 | Founders' equity, vesting, deadlock | doc 01 §9 first control against founder conflict; IP ownership of the codebase | per doc 05 §5 | 50/50 without deadlock = paralysis risk | complete doc 05 with counsel before further material work | high | doc 05 blank (FACT) | counsel | no | FOUNDERS + LEGAL | before pilot |
| D-10 | Entity and incorporation timing | contracts, PSP, courier, trademark | per counsel | cost/timing | engage accountant + lawyer now | high | — | — | no | LEGAL | 30 days |
| D-1 | Name: keep DIYAR pending screening | store listings, domain, agreements | keep / rename | dilution with Gulf real estate | screen classes 3 & 35 now; keep brand strategy name-independent | medium | doctrine §5 | trademark agent | costly after printing | FOUNDERS + LEGAL | 30 days |
| X1 | Record the Phase 0 → Phase 1 sequencing | doc 04 §7 contradiction | record / ignore | honesty of the plan | record it; run Phase 0 on the product | high | `CURRENT_ASSUMPTIONS` | — | yes | FOUNDERS | now |
| D-4 | Pilot rates and fee model (%, minimum fee, subscription option) | model heart; seller pitch | 3–5 % / 12–18 % as pack; + minimum fee; + subscription | low fee may not cover costs (doc 03 §5) | pilot at pack rates **with a minimum fee field modelled**; decide the value after interviews | medium | doc 03 §5; market commissions (13 % incl. VAT at Jumia, cited) | interviews; ADR-09 | contractual | FOUNDERS | before first agreement |
| D-5 | Settlement direction and fund holding | who holds COD cash; PSP terms | invoice houses / pay houses / split | legal, accounting | run **invoice** arrangement for COD houses now (matches cash reality); PSP for card; no fund holding until counsel | medium | `docs/architecture/08` §4 | LEGAL (L14) | contractual | FOUNDERS + LEGAL | before first payout |
| D-2 | Guest checkout and phone verification (ADR-08) | fraud, refusals, review forgery vs friction | none / OTP first order / always / ops call over amount | friction vs risk | configurable policy; default `otp_first_order` | medium | H5, M16; COD failure 20–35 % cited | SMS adapter | yes | FOUNDERS | before pilot |
| D-7 | Service area | courier tests; refusal exposure | Cairo/Giza / national self-ship | reach vs risk | Cairo/Giza for platform promises; allow houses that ship nationally with the customer told (B-4) | medium | doc 01 §7 | courier tests | yes | FOUNDERS | before pilot |
| D-6 / B-2 / B-3 | Category boundaries; inspired-by rules; mists/splashes | catalogue, brand, legal | narrow / include | value wedge vs purity | include mists/splashes from verified houses; inspired-by allowed only with counsel-approved claim rules | low | Euromonitor summary; L7–L8 | LEGAL | costly | FOUNDERS + LEGAL | before onboarding |
| B-1 | Multi-brand resellers | brand independence | refuse / allow with consent | supply vs identity | refuse in pilot | medium | doc 01 §6 | — | yes | PRODUCT | pilot |
| S-1 | Seller support inbox | one-route principle | platform only / house support role | consistency vs load | platform only through Stage 0 | medium | doc 01 §6 | — | yes | FOUNDERS | Stage 1 |
| SL-1 | Open orders on suspension | customers mid-order | complete / cancel / choice | trust | complete confirmed orders under supervision; cancel unconfirmed with notice | medium | M19 | — | yes | PRODUCT | before pilot |
| SL-4 | Reserve period and payout cadence | cash conversion vs risk | 7 d reserve, weekly / fortnightly | seller trust vs exposure | 7-day reserve, fortnightly payouts in pilot | low | doc 03 §7 | D-5 | contractual | FOUNDERS | before first payout |
| A-2 | Cost entry method (payment, courier) | contribution margin | admin entry / imports | accuracy vs effort | admin monthly entry now; imports at Stage 1 | high (decided method) | `OPEN_DECISIONS` | — | yes | FOUNDERS (build timing) | before pilot end |
| A-1 | Browsing analytics retention 180 d; banner? | PDPL | keep / change | — | keep; confirm with counsel (L10) | medium | FACT | LEGAL | yes | LEGAL | ~Oct 2026 |
| FD-1..7 | Redesign direction (palette, photography requirement, compare, verified marks, house marks, no wishlist yet, no gradient) | conversion, brand | per `docs/frontend/04` §0 | design capacity | approve all seven | medium | `docs/frontend/01` | — | yes | FOUNDERS | before R1 |
| ADR-12 | Stop mobile work after 11.2 | capacity; doc 04 §10 | stop / continue | — | stop | high | X2 | — | yes | FOUNDERS | now |
| ADR-01/03/04/06/07/09/10/13/14 | Technical architecture decisions (ledger, outbox, jobs, stock, attribution capture, DB rates, API-only reads, migrations, observability) | correctness | per ADRs | — | approve | high | audit | — | mostly yes | TECHNICAL | now |
| ADR-05 | Own OTP identity, no Supabase Auth | security-critical | keep / switch | vendor vs control | keep | high | FACT proven | — | costly later | FOUNDERS (security-critical) | now |
| ADR-11 | Notification vendor (SMS aggregator + fallback; WhatsApp later) | deliverability | SMSMisr / Victory Link / Twilio | cost, deliverability | pick one aggregator + Twilio fallback; WhatsApp after Business verification | medium | TECH_STACK §9 | L17 | yes | TECHNICAL + FOUNDERS (cost) | 30 days |
| GTM-1 | Pilot offer (shoot subsidy, onboarding help) | supply CAC | per `docs/gtm/01` | budget | approve shoot programme within D-9 | medium | photography defect (FACT) | D-9 | yes | FOUNDERS | 30 days |
| D-9 | Budget and runway | everything | — | — | 12-month plan per doc 01 §11 | — | none | D-8 | — | FOUNDERS | 30 days |
| D-3 | English locale | scope | Arabic only / bilingual | reach vs content cost | Arabic only through Stage 0 | high | doc 04 §3 | — | yes | DEFER | Stage 1 |
| M-2 | Review-aggregate bands threshold (n reviews) | honesty of bands | 5 / 10 / 20 | noise vs delay | 10 verified reviews | low | none | reviews | yes | PRODUCT | when reviews exist |
| C-1 | Return cost policy by reason (who pays return shipping) | economics, law | per reason | — | fault → seller/courier; change of mind → customer, if lawful | low | L5–L6 | LEGAL | contractual | LEGAL + FOUNDERS | before pilot |
| C-2 | Failed-delivery cost allocation by reason code | largest cost line | per code | — | customer_refused → customer/platform per policy; address_invalid → customer; courier fault → courier | low | doc 06 §7; L18 | courier contract | yes | FOUNDERS | before pilot |
| T-1 | Where the market scan's evidence gaps get closed | doc 02 §5 | sprint week 1 | — | do it in the 90-day plan | high | `docs/market/01` §4 | — | — | PRODUCT | 30 days |
| AI-1 | Any AI feature | trust | per gates | — | none until G0 | high | `docs/ai/04` | — | — | DEFER | — |
| SC-1 | Any architecture extraction | cost | per triggers | — | none until measured | high | `docs/scaling/04` | — | — | DEFER | — |

## Rules of the register

- A decision is made when it has a date, a decider and a recorded rationale; until then
  the interim product position in `docs/legal/03` or `OPEN_DECISIONS.md` applies.
- Economic, customer-policy and security-critical decisions require both founders (doc 04
  §9); the register records both names.
- Reversible decisions are made quickly with a review date; irreversible ones wait for the
  evidence named.
