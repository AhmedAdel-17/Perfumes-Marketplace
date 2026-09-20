# Data governance

## 1. Roles (doc 06 §1 "privacy and security: named compliance/security owners")

| Role | Holder (pilot) | Responsibility |
|---|---|---|
| Data protection owner (PDPL) | business founder (OPEN: may need a designated officer per executive regulations — counsel) | lawful basis, consent records, retention, requests, breach process |
| Security owner | technical founder | access, secrets, incident containment (doc 05 §7 allows immediate containment) |
| Catalogue data owner | category manager (business founder at pilot) | vocabularies, notes dictionary, quality |
| Finance data owner | finance owner (business founder at pilot) | ledger, statements, reconciliation |
| Analytics definitions owner | business founder (FACT, `ANALYTICS_DEFINITIONS.md`) | one definition per number |

## 2. Lawful basis and consent (to be confirmed by counsel — `docs/legal/03`)

| Processing | Proposed basis | Record |
|---|---|---|
| Order fulfilment (phone, name, address) | contract | `consent_records` purpose `order_fulfilment` at checkout (table exists, unused — FACT) |
| Order status messages | contract | same |
| Marketing messages (SMS/WhatsApp/email) | consent, opt-in, revocable | `consent_records` per channel |
| Anonymous browsing analytics | legitimate interest / first-party, no personal data (A-1) | privacy page states it (FACT); banner question OPEN |
| Reviews (published byline masked) | consent at submission | review record |
| Seller identity and documents | contract + legal obligation | verification records |

## 3. Access control (FACT design; gaps noted)

Row-level security keyed on actor role and id for every table; service roles narrowed by
`WITH CHECK`; money visible to owner/admin/manager only (S-1); operators cannot see take
rate (admin only, FACT). Gaps: direct SQL in the web app bypasses RLS on public reads
(H8); verification evidence not yet in a private bucket.

## 4. Retention schedule (proposed; counsel to confirm)

| Data | Retention | Mechanism |
|---|---|---|
| Browsing events | 180 days | purge function (exists), unscheduled (DEBT #5) |
| Login codes | 5 minutes | purge function (exists) |
| Sessions | 30 days after expiry | to build |
| Orders, ledger, audit, transitions | statutory / tax period (counsel) | never deleted; personal fields pseudonymised on request after the period |
| Verification evidence | duration of relationship + period counsel sets | private bucket lifecycle |
| Support tickets | with the order | — |
| Photographs | life of listing | sweep for orphans (DEBT #4) |

## 5. Subject rights process (PDPL) — to build (P1-23)

Request via support (phone-verified) → log in `privacy_requests` → verify identity by OTP →
export bundle (orders, reviews, tickets) or pseudonymise → record completion → audit.
Deletion never removes money rows; it removes the person from them.

## 6. Data quality controls (FACT + target)

Required fields and enums at the gate; duplicate slug/SKU checks; claims scanner;
moderation audit; parity tests between domain rules and database triggers. Target: notes
dictionary with review workflow; monthly catalogue quality report (missing photos, stale
stock, unsourced bands).

## 7. Sharing with houses (doc 03 §8)

A house receives: its sub-orders with recipient name, phone and address (needed to ship —
FACT snapshot), its reviews, its indicators, its statements. A house never receives: the
customer's orders from other houses, browsing data, or a customer list beyond its own
orders. Export at exit follows the same rule (SL-5 open on phone numbers).

## 8. Incidents

Breach process: contain (technical founder, immediately), assess, notify per PDPL timelines
(counsel), record. A named owner exists for every alert (`docs/architecture/09`).
