# Personas

**Method.** Every persona below is assembled only from segments and behaviours named in
docs 01, 02, 04 and 06. Where the founding pack names a segment but not its behaviour, the
behaviour is marked ASSUMPTION and paired with the interview question (doc 02 §6–7) that
will confirm or kill it. No demographic detail is invented; no persona is given a name.

**Validation status: all personas are HYPOTHESES until the doc 02 §9 sprint has run**
(15 seller interviews across three types; 30 recent-buyer interviews).

---

## 1. Customer personas

### C1 — The social-first value seeker (primary demand wedge)

| | |
|---|---|
| Source | doc 01 §4 "digital-first Egyptian fragrance buyers, especially value-conscious younger adults already discovering scents through social content" |
| Discovers through | Instagram/TikTok content from houses and creators (DOCUMENTED); market evidence that local brands sell via Instagram (FACT, `docs/market/01`) |
| Buys | affordable local alternatives or original local creations (DOCUMENTED) |
| Pays | COD first (HYPOTHESIS supported by market evidence of 45–70 % COD share, `docs/market/01`) |
| Needs | to compare price, size, concentration, notes and performance across houses without opening ten pages |
| Fears | fake or weak product, wrong item, no recourse, a page that vanishes |
| ASSUMPTION | phone is the natural identity; will not create an account before a first order; wants Arabic |
| Confirm with | doc 02 §7 questions 1–4 and 7 |

### C2 — The gift buyer

| | |
|---|---|
| Source | doc 01 §4 "gifts and who want comparison and trusted delivery" |
| Needs | reassurance (verified house, return route, presentable packaging), delivery date certainty, occasion filtering |
| Fears | arriving late, arriving damaged, not being able to return an unopened bottle |
| ASSUMPTION | less price-sensitive per order; more sensitive to delivery reliability |
| Confirm with | doc 02 §7 "bad delivery experience" and survey field "occasion" |

### C3 — The repeat fragrance buyer

| | |
|---|---|
| Source | doc 01 §4 "repeat fragrance buyers who value performance, notes, season, occasion and price rather than a single brand relationship" |
| Needs | structured scent data, honest performance bands with sources, six-dimension reviews, cross-house comparison |
| Behaviour | most likely to cross-shop and to review — the persona the data flywheel depends on |
| ASSUMPTION | willing to write structured reviews after delivery if asked at the right moment |
| Confirm with | doc 02 §7 questions 5–6 |

**Explicitly not a persona yet:** a luxury/niche buyer of imported designer fragrance
(out of category), and an English-only buyer (D-3 open).

## 2. Seller personas

### S1 — The social-first microbrand (supply wedge)

| | |
|---|---|
| Source | doc 01 §1, §4; doc 02 §4 "branded packaging, Instagram/WhatsApp demand, limited technology — best likely launch wedge" |
| Operates | orders by DM, manual courier booking, cash reconciliation by hand (DOCUMENTED problem, doc 01 §2) |
| Wants | a storefront link for the bio, order management, payouts/statements, incremental demand |
| Fears | losing customer data, being taxed on its own followers, losing control of price and brand |
| Will accept fees if | seller-originated orders carry the low fee and the platform proves it can tell the difference (doc 03 core model) |
| ASSUMPTION | owner-operated, 1–3 people; can supply product documentation only partially |
| Confirm with | doc 02 §6 all ten questions; evidence rank 2 (routes live orders) |

### S2 — The online-first established brand (second wave)

| | |
|---|---|
| Source | doc 01 §4; doc 02 §4 "own site, paid media, organised fulfilment — later: require incremental demand and credible analytics" |
| Wants | attributed demand it cannot get itself, analytics, a category-authority halo |
| Fears | channel conflict, price visibility beside cheaper houses, paying commission on customers it acquired |
| Joins when | the platform can show attributed, incremental orders and clean statements (doc 02 §11 gate) |

### S3 — The original Egyptian fragrance house

| | |
|---|---|
| Source | doc 02 §4 "differentiated formulations and brand story — important for platform credibility and category breadth" |
| Wants | its story told properly; protection from being flattened next to "inspired" products |
| Needs from us | brand-independence rules, editorial capacity, a storefront that looks like theirs |

### S4 — Traditional mixer / physical shop (excluded initially)

| | |
|---|---|
| Source | doc 02 §4 "high need; variable compliance and operational readiness"; doc 01 §4 excludes anonymous mixers and unverified claims |
| Position | not onboarded until verification (doc 06 §3) can be satisfied; revisit after pilot |

## 3. Platform / operations personas

Derived from doc 04 §1 roles and doc 06 §1 ownership. At pilot, the two founders hold all
of these; the persona is the *hat*, not a hire.

| Persona | Job (DOCUMENTED) | Primary screens | Pain the product must remove |
|---|---|---|---|
| Business founder / marketplace operations | seller acquisition, commercial terms, verification, listing quality, market policy, business reporting | `/ops/houses`, `/ops/moderation`, `/ops/insights` | seeing funnel, SLA and contribution without database work (gate 8) |
| Technical founder | product design execution, architecture, security, delivery, incidents | Sentry, jobs, audit | blindness in production (`docs/architecture/09`) |
| Operations lead (later hire) | order exceptions, customer support, courier follow-up | `/ops/queue`, `/ops/support`, exceptions | no customer timeline; no refuse/cancel actions today (FACT) |
| Finance owner | payment/COD reconciliation, payouts, statements | payouts, ledger, exception report | double payout defect (FACT C1); no reconciliation view |
| Content / category manager | scent data standardisation, merchandising, editorial | `/ops/content`, `/ops/site`, moderation | vocabularies are closed (good); no bulk normalisation tools |
| Seller staff (S-1 roles: admin, manager, operations, support) | assigned tasks with limited permissions | seller portal | cannot sign in today (FACT H11) |

## 4. Anti-personas (RECOMMENDATION, from doc 01 §4 exclusions and doc 06 §4)

Anonymous mixers; sellers using fake designer logos or "90 % identical" claims; sellers
unwilling to accept service standards; buyers seeking imported designer originals (not the
category); resellers of other houses' products (brand-independence conflict — OPEN
DECISION whether multi-brand retailers may ever join).
