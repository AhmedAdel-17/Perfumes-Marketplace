# Measurement strategy

Builds on `docs/ANALYTICS_DEFINITIONS.md` (FACT: definitions written before the dashboard,
15 Sep 2026) and doc 04 §6. Rules preserved: one definition of "completed" (the payout's
`earned`); never GMV alone; unmeasured is not zero; Cairo days.

## 1. North Star Metric

### Candidates considered

| Candidate | For | Against |
|---|---|---|
| GMV | familiar | doc 03 §10 forbids GMV alone; rewards refused COD orders and returns |
| Registered users | easy | doc 03 §3: a registered user is not a platform-acquired customer; guests exist |
| Contribution margin | the truth | a lagging money number; half its inputs unrecorded until A-2; not a daily behaviour |
| Cross-brand purchases | proves the marketplace | too narrow early; punishes storefront-SaaS value the model also sells |
| Completed orders | both sides' value; the basis of commission | can be inflated by one house's own demand |
| Active houses | supply | says nothing about buyers |

### Selected: **Completed orders per month** — with three guardrails

Definition: sub-orders classified `earned` (delivered, cash in hand, reserve passed —
the payout's own classifier, FACT). Counted per house and in total.

Why it aligns with the model: commission is charged only on completed orders (doc 03 §8);
both a seller-originated and a marketplace-generated order count, which matches the
hybrid "marketplace plus seller OS" thesis; it cannot be gamed by refusals or registrations;
every team's work (supply, discovery, trust, operations, finance) moves it.

Guardrails (a rise in the North Star with a fall in any guardrail is not progress):

1. **Contribution per completed order ≥ 0** (or a stated path) — doc 03 §4.
2. **Marketplace-attributed share of completed orders** trending up — the 12–18 % stream
   must be real (doc 02 §11).
3. **Refusal rate ≤ market baseline** (COD first-attempt failure 20–35 % nationally — FACT
   `docs/market/01`) — failed delivery is the largest cost line.

## 2. Measurement hierarchy

```
North Star: completed orders / month (+3 guardrails)
├─ Strategic: GMV (earned) · contribution margin · effective take rate · 90-day repeat ·
│             cross-brand purchase rate · active houses · marketplace-attributed share
├─ Functional: customer funnel (03) · seller funnel (04) · marketplace health (05) ·
│              financial · operational · trust
└─ Diagnostic: per stage, per house, per governorate, per source, per reason code
```

## 3. Principles

- A metric without a definition in `ANALYTICS_DEFINITIONS.md` does not appear on a screen.
- Every rate carries numerator and denominator (FACT practice).
- Cohorts, not snapshots, for repeat and retention.
- Seller metrics count sub-orders; customer metrics count orders (FACT).
- Reviewed weekly by the founders on the cadence in `docs/operations/03`.

## 4. Where numbers live

`/ops/insights` for founders (FACT); seller portal for each house's own; a monthly written
review (doc 06 §13) with the same definitions. No second BI tool until `/ops/insights`
cannot answer a question the founders ask twice.
