# Data strategy

Doc 01 §8 names the defensible assets: **the normalised Egyptian scent catalogue, verified
transaction/review history, seller workflow integration, category reputation and the
repeat customer relationship. The website code alone is not defensible.** This strategy
turns that sentence into decisions about what to collect, what to refuse, who owns it, and
what it must become.

## 1. Strategic position

- **Data is the product's moat; privacy is its licence.** PDPL 151/2020's executive
  regulations were issued in November 2025 with a one-year grace period, so full
  enforcement is expected around October 2026 (FACT, sources in `docs/legal/01`). The
  company launches into an enforced regime.
- **Collect structure, not surveillance.** The catalogue schema and the order graph carry
  most of the value; browsing trails carry little and cost trust (A-1 already chose:
  anonymous, minimal, 180 days — FACT).
- **One definition per number** (`ANALYTICS_DEFINITIONS.md`), or the dashboards contradict
  each other and the data asset is worth nothing.

## 2. The four strategic data assets (ranked by defensibility)

| Rank | Asset | Why defensible | Owner | Status (FACT) |
|---|---|---|---|---|
| 1 | **Normalised scent catalogue** — controlled vocabularies, notes, bands with source, compliance fields, revisions | nobody else has structured Egyptian local perfumes this way; grows with every house; expensive to replicate | category manager | schema and gate exist; 3 seeded products; notes are free-text arrays (no dictionary yet) |
| 2 | **Verified transaction and review graph** — delivered orders → six-dimension reviews → house indicators | reviews tied to deliveries cannot be scraped or bought | ops (integrity), product | gate exists; review volume zero |
| 3 | **Attribution and economics ledger** — touches, decisions, snapshots, ledger entries | proves the fair-fee model; the basis of seller trust and of contribution analysis | finance / business founder | designed; capture inert; ledger absent |
| 4 | **Cross-house behaviour** — baskets and repeat across houses, anonymised | proves the marketplace is more than storefront SaaS (doc 02 §11) | product | derivable from orders once volume exists |

## 3. Data principles

1. Every number states its source (`performance_source`, attribution touch, ledger kind).
2. Unrecorded is shown as unrecorded (rule 3).
3. Snapshot what money depends on (rates, prices, addresses, SLAs) — FACT practice.
4. Append-only for money, transitions, audit, revisions — FACT practice; extend to ledger.
5. Minimal personal data; phone is the identity; no search text; no customer id in
   browsing events (FACT A-1).
6. Sellers get the data to serve their orders, not the customer base (doc 03 §8).
7. Definitions before dashboards (doc 04 §6).

## 4. What we deliberately do not collect

Search query text · third-party analytics scripts · device fingerprints · precise
geolocation · customer identity in browsing trails · reviews from non-delivered orders ·
scraped competitor data presented as our own.

## 5. What the data must become (12-month targets, RECOMMENDATION)

- A **notes dictionary** with canonical Arabic/Latin names and synonyms, replacing free-text
  arrays (prerequisite for compare, search facets and any future similarity work).
- **House indicators** computed monthly from the order graph (doc 06 §11).
- **Review-aggregate performance bands** replacing seller-provided bands once a listing
  has enough verified reviews (threshold OPEN; source disclosed).
- A **ledger** every statement and every owner metric reads from.
- **Cohort tables** for 90-day repeat, direct return and cross-brand purchase.

## 6. Data ownership map — see `02-data-assets.md`; flywheel — `03`; governance — `04`.
