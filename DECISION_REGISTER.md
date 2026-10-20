# DECISION REGISTER

**Canonical register of every decision the company must make or has made.** Supersedes
`docs/company/03-decision-register.md` (kept as the blueprint's snapshot) and incorporates
`docs/OPEN_DECISIONS.md` (kept for its engineering interim positions; when the two
disagree, this file wins and the other is corrected by task P0.1.4).

Classes: **FOUNDERS MUST DECIDE** (doc 04 §9: economics, customer policy,
security-critical architecture; doc 05 §7 unanimous matters) · **LEGAL MUST DECIDE**
(counsel / accountant / PSP / regulator / trademark agent) · **TECHNICAL TEAM CAN DECIDE**
· **PRODUCT TEAM CAN DECIDE** · **DEFER**.

Status: `OPEN` · `INTERIM` (a pilot value with a review date) · `DECIDED` (date, deciders)
· `SUPERSEDED`.

Rules: a decision is made when it has a date, the deciders' names and a rationale; economic,
customer-policy and security-critical decisions carry both founders' names; irreversible
decisions wait for the evidence named; reversible ones are made quickly with a review date;
every gate outcome is recorded here.

---

## A. New decisions from the red team (18 Sep 2026)

| ID | Decision | Class | Why it matters | Options | Recommendation | Evidence needed | Reversible | Owner | Deadline | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| DR-01 | Adopt kill criteria K1–K15 with thresholds and periods | FOUNDERS | prevents emotional attachment; makes day-90 a decision, not an argument | adopt as proposed / adjust thresholds / reject | adopt; adjust K2 (25 completed) and K4 (35 % refusal) only with a written reason | `FOUNDER_RED_TEAM.md` §5 | yes | both founders | P0.2.4 | OPEN |
| DR-02 | Attribution rule for branded search and copied links | FOUNDERS (economics) | a follower who Googles the house after Instagram would be billed at the marketplace rate; houses will feel taxed | (a) branded search = `storefront_referral`; (b) branded search = `organic_search`; (c) any touch within N days of a storefront touch defers to it | (a) — doubt goes to the house, consistent with `unknown` taking the low rate | one month of captured touches; dispute count | yes (rule set version) | both founders | P0.2.5 | OPEN |
| DR-03 | Pilot money handled manually; no software payout until the ledger (P3.1.5) | FOUNDERS (economics) + TECHNICAL | `runPayout` double-pays (C1) | manual statements / fix first then pilot / pay nothing during pilot | manual two-person statements, invoice per D-5 interim, software guard on | P0.1.3, P1.4.7 | — | both founders | P0.2.5 | OPEN |
| DR-04 | Pilot category boundary: inspired-by products in or out; body mists/splashes in or out (D-6/B-2/B-3) | FOUNDERS + LEGAL | may define most of the addressable supply (press shows inspired-by as a major segment) and the brand | in with counsel-approved claim rules / out for pilot / mists in, inspired out | decide only after counsel L7/L8 and the 15 interviews' inspired-by share | P0.3.1, P0.4.2 | costly | both founders + counsel | GATE 0 | OPEN |
| DR-05 | Definition of "product responsibility" evidence and whether EDA-related documentation is a verification requirement (L7) | LEGAL | may exclude most small houses or expose the platform | as counsel advises | — | P0.3.1 | — | counsel | 30 days | OPEN |
| DR-06 | Multi-house delivery: allow house-funded free-delivery thresholds now; consolidated-pickup experiment only in Phase 7 | FOUNDERS (economics) | per-house fees suppress cross-brand baskets (A6) while subsidy is forbidden (doc 03 §10) | allow house-funded thresholds / nothing / platform subsidy (rejected by pack) | allow house-funded thresholds (house sets, visible); measure basket abandonment when a second house is added | P2.3.1, P2.3.4 | yes | both founders | P0.2.5 | OPEN |
| DR-07 | Brand-standard fit test: show the noir/brass shopfront to buyers in interviews before any redesign spend (A10) | PRODUCT | the wedge is value-conscious; the doctrine is Dior | test in P0.4.3 / assume | test | P0.4.3 | — | business founder | P0.4.3 | OPEN |
| DR-08 | Pre-agree the pivot branch for each kill criterion (`FOUNDER_RED_TEAM.md` §6) | FOUNDERS | a pivot should be a plan, not a panic | per criterion | K1/K7/K6 → B4 or B2; K4 → area/card policy then B1 or B4; K5 → B3 reprice; K12 → narrow category or stop; K13/K14 → shrink test or stop | — | yes | both founders | P0.2.4 | OPEN |
| DR-09 | Engineering freeze: no work outside Phases 0–3 of `MASTER_EXECUTION_PLAN.md` until GATE 4 | FOUNDERS + TECHNICAL | the effort-to-evidence ratio is the central risk | freeze / continue WORK_PLAN | freeze; WORK_PLAN retired as driver (P0.1.4) | — | yes | both founders | now | OPEN |
| DR-10 | Which story: a real small business at the low fee, or a venture-scale marketplace at the marketplace rate (sets D-9) | FOUNDERS | budget, hiring, investor conversations, patience with the SaaS branch | small / venture / decide after GATE 4 | decide after the 15 interviews, before D-9 | P0.4.2 | yes | both founders | P0.2.3 | OPEN |
| DR-11 | Company-controlled ownership of accounts (GitHub, domain, Vercel, Supabase, R2, SMS, PSP) before the entity exists | FOUNDERS | doc 05 §6 | one founder's personal accounts with shared recovery / wait for entity | shared recovery and both founders as admins now; transfer at incorporation | — | yes | both founders | P0.1.2 | **DECIDED for GitHub only, 2026-09-20, Ahmed Adel.** The repository is `AhmedAdel-17/Perfumes-Marketplace`, private, on a PERSONAL account, approved in writing to unblock P0.1.2. **Still OPEN and not covered by this approval:** every other account (domain, Vercel, Supabase, R2, SMS, PSP); the recommendation's two conditions — a second admin and a shared recovery route — neither of which exists yet, so the repository today has a single point of failure in one person's credentials; and transfer to the entity at incorporation (P0.2.2). This register requires both founders' names on a FOUNDERS-class decision; only one is recorded, which is a gap to close, not a formality met. |
| DR-12 | Review request timing and form length (six required dimensions may suppress reviews — A25) | PRODUCT | flywheel asset #2 | keep six required / six with fewer required / ask at +7 days by message | keep six but test a two-step form in Phase 4 | reviews per earned in the pilot | yes | product | P4.2.2 | OPEN |
| DR-13 | Whether the hardcoded-colour CI guard exempts SVG artwork, and what happens to the 31 raw hexes it finds | FOUNDERS (design doctrine) + TECHNICAL | CLAUDE.md §0.5 and §14 forbid a hardcoded colour outright and say to ASK when a token is missing; the guard has never run until 20 Sep 2026 and fails on existing code, so `main` cannot go green without answering this | (a) exempt artwork files or SVG `stopColor` from the grep and tokenise nothing; (b) move every raw hex into `tokens.json` and derive the artwork from tokens; (c) exempt artwork, fix the one genuine violation, and register the rest as debt | (c), split by category — the 2 hits inside COMMENTS are guard false positives and cost nothing to exclude; `CartView.tsx:152` is a real Tailwind arbitrary-value gradient and is a true violation; the ~26 `stopColor` stops in `Flacon.tsx` are a photoreal glass render whose specular, brushed-metal and caustic values are artwork, not theme, and `RIM_LIGHT` already carries a written argument for staying separate from the `bone` token it happens to equal | none needed — the files and line numbers are in the failing run | yes | both founders | P0.1.5 | **DECIDED 2026-09-21, Ahmed Adel: option (c), split by category.** Comments are excluded from the guard (they were false positives); the `Flacon.tsx` glass render is exempt as artwork by a rule stated in the guard with its reason; genuine component colours become tokens. **Amended the same day on new evidence:** fixing the guard revealed the cart gradient was one of FOUR copies of the same stage backdrop, with nine colours the old matcher could not see. Asked again and decided: **one `stage` palette of three tokens** (glow `#2A2019`, mid `#141010`, deep `#070606`, the product tile’s values), used by all four, each screen keeping its own gradient shape; dark in both themes. Implemented by P0.1.5. |
| DR-14 | How `main` gets branch protection, given that GitHub charges for it on a private repository | FOUNDERS (spend, and security-critical architecture) | P0.1.2 cannot close without it, and every later task that assumes reviewed, CI-verified changes rests on it; today anyone with the credentials can push straight to `main` | (a) GitHub Pro on the personal account, about US$4/month, works today; (b) a GitHub organisation on the Team plan, about US$4 per user per month, which also gives the second admin and the shared recovery DR-11 still lacks; (c) make the repository public — free, and it publishes `docs/`, the economics and `FOUNDER_RED_TEAM.md`; (d) accept an unprotected `main` for the pilot and register it as debt | (b) if the entity decision (P0.2.2) is near, since it satisfies DR-11's open half at the same price; (a) if it is not, because US$4 is not a decision worth blocking P0.1.2 over. **(c) is rejected here on the founders' behalf and was not attempted** — it discloses the strategy, and no one asked for that | the monthly budget line from P0.2.3 | yes | both founders | P0.1.2 | **DECIDED 2026-09-21, Ahmed Adel: option (d), stay unprotected for now.** `main` has no branch protection; anyone with push access can push to it directly. Registered as DEBT #23 with triggers. The protection shape is written into P0.1.2 so applying it later is mechanical. Option (c), making the repository public, was never on the table. |
| DR-15 | Whether Phase 3 work may start before GATE 1, and which parts | FOUNDERS (sequencing) | the plan contradicts itself: Phase 3's preamble says it runs “from GATE 1”, while task-level `Depends on` lists are satisfied for P3.4.1 and P3.4.2. GATE 1 is blocked on P0.2 decisions, so a strict reading leaves engineering with nothing to do at all | (a) the P3.4 “Structure and security” workstream may proceed, the ledger workstreams (P3.1–3.3) wait for GATE 1; (b) all of Phase 3 waits; (c) all of Phase 3 may proceed | (a). P3.4 is not money logic, Phases 0–3 are the freeze envelope DR-09 proposes, and P3.4.1 was the direct fix for the superuser RLS bypass P1.4.6 surfaced | none — this is a sequencing judgement, not an evidence question | yes | both founders | now | **DECIDED for P3.4.1, 2026-09-20, Ahmed Adel**, asked and answered in session. **Extended to P3.4.2, 2026-09-21, Ahmed Adel**, by the instruction to “proceed with the next steps” when P3.4.2 was the only next step — read as option (a), the P3.4 workstream. **Still OPEN for P3.1–P3.3**, the ledger, stock, rules and jobs workstreams: none is executable today anyway, since each depends on P1.2.x or P1.1.2, but the question returns the moment they are. |

## B. Decisions carried from the blueprint register (status as of 18 Sep 2026)

| ID | Decision | Class | Recommendation (unchanged unless noted) | Owner | Deadline | Status |
|---|---|---|---|---|---|---|
| D-8 | Founders' equity, vesting, deadlock (doc 05) | FOUNDERS + LEGAL | complete with counsel before further material work | both founders | P0.2.1 | OPEN |
| D-10 | Entity and incorporation timing | LEGAL | engage lawyer and accountant now | founders + counsel | P0.2.2 | OPEN |
| D-9 | Budget and runway | FOUNDERS | 12-month plan; ≥ 6 months at GATE 0 or shrink the test (K13) | both founders | P0.2.3 | OPEN |
| D-1 | Name DIYAR pending screening | FOUNDERS + LEGAL | screen classes 3 & 35 now; brand strategy name-independent. **Desk knock-out 24 Sep 2026 (`docs/brand/08`): five prior perfume uses of "Diyar", mostly Gulf; diyar.eg free, diyar.com taken; Arabic search conflates ديار with ديور (Dior)** | trademark agent | P0.3.2 | OPEN |
| X1 | Record the Phase 0 → Phase 1 sequencing | FOUNDERS | record; run Phase 0 on the product | both founders | P0.2.4 | OPEN |
| D-4 | Pilot rates and fee model (%, minimum fee, subscription option) | FOUNDERS | pack rates 5 % / 15 % as INTERIM with a minimum-fee field modelled; final after interviews | both founders | P0.2.5 (interim), GATE 4 (final) | OPEN |
| D-5 | Settlement direction and fund holding | FOUNDERS + LEGAL | INTERIM: invoice COD houses; no fund holding; card only after L14 | both founders + counsel | P0.2.5 (interim), P4.4.1 (final) | OPEN |
| D-2 | Guest checkout and phone verification (ADR-08) | FOUNDERS | configurable policy, default `otp_first_order` | both founders | P0.2.5 | OPEN |
| D-7 | Service area | FOUNDERS | Cairo/Giza for platform promises; self-shipping houses may serve other governorates with the customer told (B-4) | both founders | P0.2.5 | OPEN |
| D-6 / B-2 / B-3 | Category boundaries | FOUNDERS + LEGAL | see DR-04 | — | GATE 0 | OPEN |
| B-1 | Multi-brand resellers | PRODUCT | refuse in pilot | product | pilot | OPEN |
| S-1 | Seller support inbox | FOUNDERS | platform only through Stage 0 | both founders | Stage 1 | OPEN |
| SL-1 | Open orders on suspension | PRODUCT | complete confirmed under supervision; cancel unconfirmed with notice | product | P4.8.1 | OPEN |
| SL-4 | Reserve period and payout cadence | FOUNDERS | 7-day reserve; fortnightly (manual in pilot) | both founders | P0.2.5 | OPEN |
| A-2 | Cost entry method | FOUNDERS | decided method (admin entry); build timing before pilot end | founders | P2.2.5 / P4.3.3 | DECIDED (method) 15 Sep 2026 |
| A-1 | Browsing analytics retention 180 d; banner question | LEGAL | keep; confirm L10 | counsel | ~Oct 2026 | INTERIM |
| FD-1..7 | Redesign direction (palette, photography requirement, compare, verified marks, house marks, no wishlist yet, no gradient) | FOUNDERS | approve all seven (FD-1 after DR-07's test) | both founders | P0.2.6 | **FD-1 and FD-7 DECIDED 14 Oct 2026, Ahmed Adel** — visual identity v2, chosen from four samples in `design-reference/redesign/`: LIGHT "Laboratoire" (sample 4) is the default theme, DARK "Noir" (sample 2) is the alternative; ONE layout, sample 4's, for both; product photographs in full colour in both themes, black-and-white only for hero and editorial imagery in Noir; the primary action is a flat fill, no gradient (FD-7). Replaces the noir/brass identity and the Amiri/Bodoni faces. Taken without DR-07's buyer test, and with one founder's name where this register asks for both — recorded as a gap, not a formality met. FD-2..6 still OPEN. Implementation: task P5.1.3. |
| ADR-12 | Stop mobile work after 11.2 | FOUNDERS | stop | both founders | P0.2.6 | OPEN |
| ADR-01/03/04/06/07/09/10/13/14 | Technical architecture decisions | TECHNICAL | approve | technical founder | P0.2.6 | OPEN |
| ADR-05 | Own OTP identity, no Supabase Auth | FOUNDERS (security-critical) | keep | both founders | P0.2.6 | OPEN |
| ADR-11 | Notification vendor (SMS aggregator + fallback; WhatsApp later) | TECHNICAL + FOUNDERS (cost) | one aggregator + Twilio fallback; open the account | technical founder | P0.2.6 | OPEN |
| GTM-1 | Pilot offer (shoot subsidy, onboarding help) | FOUNDERS | approve within D-9 | both founders | P0.2.3 | OPEN |
| D-3 | English locale | FOUNDERS | Build now: Arabic and English, with a language switch on every screen | Ahmed (founder) | P5.6.2 | DECIDED 30 Sep 2026 |
| V-1 | Interface Arabic register | FOUNDERS | Egyptian Arabic across the interface; Terms, Privacy and Returns stay in simple Modern Standard Arabic (contracts, pending counsel review) | Ahmed (founder) | P5.6.3 | DECIDED 30 Sep 2026 |
| M-2 | Review-aggregate bands threshold | PRODUCT | 10 verified reviews | product | P4.9.1 | OPEN |
| C-1 | Return cost policy by reason | LEGAL + FOUNDERS | fault → seller/courier; change of mind → customer, if lawful | counsel + founders | P0.2.5 (interim) | OPEN |
| C-2 | Failed-delivery cost allocation by reason code | FOUNDERS | per code; courier fault → courier | both founders | P0.2.5 (interim) | OPEN |
| T-1 | Close the market scan's evidence gaps | PRODUCT | P0.4.4 | business founder | 30 days | OPEN |
| AI-1 | Any AI feature | DEFER | none until G0 | — | — | DEFERRED |
| SC-1 | Any architecture extraction | DEFER | none until a trigger | — | — | DEFERRED |
| M-1 | Media store: Cloudflare R2 | — | — | — | — | DECIDED 15 Sep 2026 |
| — | Delivery fee follows the party that bears the cost | — | — | — | — | DECIDED 4 Sep 2026 |
| — | CMS built in-house, not Payload | — | — | — | — | DECIDED 4 Sep 2026 |

## C. Legal questions (LEGAL MUST DECIDE) — answers recorded here

| ID | Question (full text in `docs/legal/03-open-legal-questions.md`) | Unlocks | Status |
|---|---|---|---|
| L1 | Entity type, VAT registration, e-invoicing | contracts, PSP, courier | OPEN |
| L2 | Equity/vesting/leaver/deadlock under Egyptian law | founders' agreement | OPEN |
| L3 | Seller agreement signature method | onboarding | OPEN |
| L4 | Withholding/offset of payouts | ledger reversal policy | OPEN |
| L5 | Return rights on opened perfume; "sealed only" | returns policy | OPEN |
| L6 | Return shipping bearer; refund timing | policy | OPEN |
| L7 | EDA cosmetics notification for small houses; labelling; platform liability | DR-04, DR-05 | OPEN |
| L8 | Inspired-by wording; designer references | DR-04, comparison scope | OPEN |
| L9 | DIYAR availability classes 3 & 35 | D-1 | OPEN |
| L10 | Lawful basis for anonymous analytics; banner; 180 d | A-1 | OPEN |
| L11 | PDPL registration/licensing; DPO | P6.1.7 | OPEN |
| L12 | Data in Frankfurt / Cloudflare; processor terms | infrastructure | OPEN |
| L13 | Order-record retention vs erasure; pseudonymisation | P4.7.1 | OPEN |
| L14 | Receiving customer funds; balances; split settlement; COD remittance to platform | D-5, P4.4.1 | OPEN |
| L15 | VAT on commission and shipping reimbursement | statements, P6.1.5 | OPEN |
| L16 | Sponsored/creator disclosures | P5.2.2, P5.4.2 | OPEN |
| L17 | SMS sender registration; WhatsApp templates; consent | P1.1.1, P1.1.3 | OPEN |
| L18 | Courier liability; failed-attempt charges passed to customers | C-2 | OPEN |
| L19 | Data houses may receive and retain; export at exit | seller agreement | OPEN |
| L20 | Age or other consumer rules for online fragrance sales | terms | OPEN |

## D. Gate outcomes

| Gate | Date | Deciders | Outcome | Evidence summary |
|---|---|---|---|---|
| GATE 0 | — | — | — | — |
| GATE 1 | — | — | — | — |
| GATE 2 | — | — | — | — |
| GATE 3 | — | — | — | — |
| GATE 4 | — | — | — | — |
| GATE 5 | — | — | — | — |
| GATE 6 | — | — | — | — |
| GATE 7 | — | — | — | — |
| GATE 8 | — | — | — | — |
| GATE 9 | — | — | — | — |

## E. Decision log

Format: `YYYY-MM-DD · ID · deciders · outcome · rationale · what it unlocks`

- 2026-09-18 · register created · Claude Code (planning) · — · consolidates the blueprint
  register, `OPEN_DECISIONS.md` and twelve new red-team decisions · P0.2.x tasks in
  `MASTER_EXECUTION_PLAN.md`.

- 2026-09-30 · D-3 · Ahmed (founder) · English locale un-deferred: build it now, with a
  language switch · founder review of the running site found an Arabic-only product too
  narrow for the audience · P5.6.2 brought forward, after P5.6.3.

- 2026-09-30 · V-1 · Ahmed (founder) · the interface speaks Egyptian Arabic; the three legal
  pages stay in simple Modern Standard Arabic · the product is for Egyptians, and the
  approved mockups (`design-reference/marketplace.html`) already use Egyptian Arabic;
  contracts stay formal until counsel reviews them · supersedes `docs/brand/04` §1.4 and §2
  (corrected the same day) · P5.6.3.

- 2026-10-14 · FD-1, FD-7 · Ahmed (founder) · visual identity v2: light "Laboratoire"
  (putty, paper, sepia ink, olive accent; Noto Naskh Arabic / IBM Plex Sans Arabic /
  Newsreader / IBM Plex Mono) is the default theme and dark "Noir" (black and bone, no
  colour accent; Reem Kufi / Noto Kufi Arabic / Archivo) the alternative, over one layout
  taken from sample 4; product photographs stay in colour; flat primary action · the
  founder judged the current frontend "cheap, not optimised, AI-generated" and chose from
  four rendered samples · supersedes DESIGN_DOCTRINE laws III and IV and §7, and the
  Amiri/Bodoni typography in CLAUDE.md §15 · P5.1.3 (brought forward past GATE 5, as D-3
  was). DR-07's buyer test of the luxury frame was not run first.

- 2026-10-16 · FD-1 amended · Ahmed (founder) · the light and dark themes share ONE style —
  Laboratoire's faces, weights, layout and finish — and differ in colour only; Noir keeps
  its black-and-bone palette and loses its own type (Reem Kufi, Noto Kufi Arabic, Archivo
  condensed capitals) · the founder, testing the finished redesign, preferred Laboratoire's
  style and wanted the theme switch to change colour and nothing else · supersedes the
  dark-theme column of CLAUDE.md §15 and DESIGN_DOCTRINE law III · P5.1.3 follow-up.

- 2026-10-17 · FD-1 amended · Ahmed (founder) · Noir's palette becomes 'Graphite & ambre':
  warm charcoal `#201E1C` with visibly stepped surfaces, bone ink `#F8F3EB`, and ONE accent,
  honey amber `#EDA53E` (Noir had no colour accent) · the founder found black-and-bone too
  dark, flat and not luxurious, rejected four further palettes (sepia, olive, midnight,
  bordeaux), then chose this from four charcoal options rendered on the real site · the
  dark colours of `design-reference/redesign/02-noir-absolu.html` are superseded; every role
  re-proved at 4.5:1 on every surface · P5.1.3 follow-up.

- 2026-10-17 · Masthead "Atomiseur" · Ahmed (founder) · the masthead is redesigned from
  three fragrance-led concepts (`design-reference/redesign/header/`: Sillage, Atomiseur,
  Pyramide); 02 Atomiseur chosen — the wordmark condenses out of a mist once per visit,
  links bloom a cloud of the accent, and Perfumes opens a panel of the seven scent families
  as vials (each linking to the filtered catalogue) beside the houses. The top line with the
  cash-on-delivery and verification statements is removed at the founder's request (both
  facts remain at checkout and on the verification standard) · the founder found the
  masthead and its controls generic, and asked that every design draw on the fragrance
  business · supersedes the masthead of `04-laboratoire.html` · P5.1.3 follow-up.

- 2026-10-17 · Customer-first storefront · Ahmed (founder) · every customer page speaks only to
  someone buying perfume. Removed from the shop: the home page's "eight checks before a house
  can sell" section and its "apply as a house" box, the "How we verify a house" link, the
  "Verified 8/8" stamp, the verification column of the houses table, the verification row
  on a house page, and "register" as the name of the catalogue ("Recently registered" → "New
  arrivals"; "The register" → "The collection"). Houses get ONE door: a band at the top of
  the footer on every page — "Are you a perfume house?" — leading to the application form ·
  the founder found the site addressing houses where it should address buyers · the
  eight-point review stays where houses read it, on the apply page; reviews keep "Verified
  purchase", which is for buyers · P5.1.3 follow-up.

- 2026-10-19 · Le Dévoilement (the reveal) · Ahmed (founder) · a perfume's bottle is lifted out
  of its own photograph and stood up in light on its product page, its notes rising from the
  nozzle to orbit it — the first of four "experiences" prototyped on 18 Oct
  (`design-reference/experiences/`; the order agreed: the reveal, then the details, then the
  day-on-the-skin dial, then the scent map once the catalogue is larger). The object is a
  2.5D RELIEF made from the house's photograph (cut-out, relief map, placement) — never a
  generated 3D model, which would invent a back of the bottle nobody photographed. Three
  choices, each the recommended option: (1) the platform's CONTENT TEAM makes each relief in
  the console (`/ops/reliefs`), houses do nothing new — trust before scale; (2) the bottle is
  cut out AUTOMATICALLY for a photograph on a plain background and TRACED BY HAND otherwise,
  in the operator's browser, with no new library and no machine-learning model; (3) the
  reveal opens from the PRODUCT PAGE only, first, so it can be measured before it spreads ·
  the founder asked for a site that is not "a normal website", and approved the prototype
  pipeline ("we will use what you have built") · migrations 0032 (reliefs) and 0033 (the
  `reveal_open` event, with its success measure in ANALYTICS_DEFINITIONS §2b) · task P5.1.4.
  OPEN for legal: the seller agreement must permit the platform to make derived presentations
  (cut-outs) of the photographs a house uploads.

- 2026-10-19 · The experiences, steps 2–4 (Les Détails, La Durée, La Carte) · Ahmed (founder) ·
  the plan approved on 19 Oct ("build steps 2, 3 and 4 as planned"), built 20 Oct as tasks
  P5.1.5–P5.1.7, in the founder's order. Choices taken in it, each the recommended option:
  (1) LE SILLAGE trails the mouse over the HOME page's opening perfume, not the product
  photograph — that photograph is already the reveal and the loupe, and one surface does one
  thing under the pointer; (2) LE FLACON, the size picker, is DEFERRED — every perfume has one
  size in the catalogue and a picker would show prices that do not exist; it returns with
  size variants; (3) the prototype's BAG JUMP is left out of La Goutte — it overshoots, which
  law VI and the tokens forbid; the bag spritzes and its count rises as the drop lands;
  (4) L'ENCRE writes a title in `ceremony` (1.6 s), not the prototype's 3 s — tokens only;
  (5) the LOUPE never magnifies past the photograph's own pixels and prints its true power;
  (6) LA DURÉE replaces the evolution chart on the product page as a compact dial (drag,
  arrow keys, or "spray" to play; never by itself), drawn from the declared bands with their
  source beside it, and no sentence says "lasts N hours" — a band is a word, never a number;
  measured by a new event, `dial_turn`; (7) LA CARTE is built now although this register said
  "once the catalogue is larger": a family for every note in the glossary (chosen in
  `/ops/notes`, audited), a `/scent-map` page dark in both themes reached from the masthead's
  Perfumes panel, a note with no family left off the map rather than guessed, and a new event,
  `scent_map_view` · the founder asked for all three after approving Le Dévoilement.
