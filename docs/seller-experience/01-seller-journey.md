# Seller journey blueprint

The house's path from first contact to exit, as an experience. Stage rules, documents and
permissions are in `02-seller-lifecycle.md`; qualification in `03`; success and retention in
`04`; growth and enforcement in `05`. Persona references: `docs/product-strategy/02`.

## 1. Visual journey

```mermaid
journey
  title A social-first microbrand (S1) joins and sells — target state
  section Consider
    Hears of DIYAR from a founder visit, another house, or a buyer: 3: House
    Reads "how it works for houses" and the fee model: 3: House
    Applies with a 40-word note and its Instagram: 4: House
  section Qualify
    Founder call; catalogue export requested; test order agreed: 4: House, Platform
    Uploads verification evidence; signs the agreement: 3: House
    Completes a full test order end to end: 4: House, Platform, Courier
  section Launch
    Enters 5–20 perfumes with photographs; moderation returns coded gaps: 3: House
    Storefront goes live; puts the link in its bio: 5: House
  section Operate
    Gets a new-order message; confirms in minutes: 5: House
    Ships with a tracking number; customer told automatically: 4: House
    Sees the statement, checks it against cash, no dispute: 4: House
  section Grow
    Sees attributed marketplace orders it did not bring: 5: House
    Sees indicators; is featured; adds products: 4: House
  section Wobble
    Misses SLAs; gets a warning and a cure plan: 2: House, Platform
```

## 2. Stages

| Stage | Seller goal | Platform responsibility | Trust moment | Failure | Owner (doc 06 §1) |
|---|---|---|---|---|---|
| **Lead** | be taken seriously | know the segment (S1–S4), approach personally, promise nothing about demand | founder shows up in person or by voice, not a form | pitching "traffic" you cannot prove (RISK) | business founder |
| **Qualification** | understand the deal quickly | one page: what we do, what it costs, who owns the customer data, what we require | fee model explained with an example order (`docs/economics/02`) | S4 accepted before verification is possible | business founder |
| **Application** | apply in ten minutes | form with terms first (FACT), rate limited, intake queue | the storefront address shown as typed (FACT) | application ignored for days | ops |
| **Verification** | pass without bureaucracy | 8 controls, each with evidence and reviewer; private bucket for documents | "we check everyone" is the reason buyers trust them | evidence sent over WhatsApp and lost (RISK); control skipped (impossible by trigger, FACT) | ops + legal |
| **Contract** | know the rules | seller agreement (`docs/legal/02`): fees, attribution windows, SLAs, claims, returns, data, suspension | signature before any listing | agreement wording unreviewed by counsel (OPEN) | business founder + counsel |
| **Catalogue onboarding** | publish 5–20 perfumes | import/entry with gaps counter, vocabularies, claims scanner, photography guide, paid shoot option | a perfume is refused for a *coded* reason, never "not good enough" | photographs missing → nothing publishes (FACT gate) | category manager |
| **Training** | run orders without calling us | 30-minute walkthrough: queue, confirm/decline, dispatch, returns, statement; a one-page Arabic guide | the first decline reason is chosen with understanding | house never learns the dispatch clock exists | ops |
| **Storefront launch** | look like itself | mark, banner, story, terms; link with attribution; monitoring window of 14 days (doc 06 §2) | the page in the bio is *their* page | generic template look (today, FACT) | ops + brand |
| **First order** | not mess it up | message within a minute; countdown; address and items clear | the platform notices before the house does | no notification (today) | ops watches for 14 days |
| **Fulfilment** | confirm and ship on time | SLA clocks, pre-breach alerts, courier booking (later), reason codes | breach visible to both, before it happens | ops toil on manual tracking | house; ops monitors |
| **Payout** | get money that matches reality | ledger, statement, dispute deadline, one settlement per sale, direction per D-5 | statement accepted without a call | double payment (C1 today) | finance |
| **Analytics** | know what sells and why | orders by source with the deciding touch; effective take rate; indicators | seeing a marketplace-attributed order it did not bring | attribution inert (today) | product |
| **Growth** | more orders, more products | merchandising eligibility by indicators; campaigns with attribution; creator codes (Phase 2) | being featured for performance, never for payment without a label | pay-to-play perception (doc 03 §2 forbids) | business founder |
| **Warning** | fix it before it's serious | coaching → written warning with cure plan (doc 06 §11 ladder) | the warning cites the metric and the number | vague warning | ops |
| **Suspension** | know why and how to return | listing restriction → temporary suspension; open orders policy | reason code, audit entry, reinstatement path | open orders abandoned (M19) | ops + business founder |
| **Termination / exit** | leave cleanly | final statement, data export of its own orders, storefront redirect, reviews retained | money settled within the dispute window | dispute over final payout | finance + legal |

## 3. What the house should feel at each stage (brand, `docs/brand/04`)

Considered → chosen → checked → prepared → launched → supported → paid → seen → grown.
Never: processed, ranked, taxed, blamed.

## 4. Journey variants

- **S2 online-first brand:** shorter onboarding (has data and photos), longer commercial
  negotiation (fee terms, channel conflict), joins after evidence of attributed demand.
- **S3 original house:** editorial support at launch; story and mark matter most.
- **Multi-person house:** staff invited with S-1 roles; owner keeps money and ownership.
- **House that stops responding:** SLA breaches → ops contact → orders cancelled
  `seller_unresponsive` with customer messages → warning → suspension.
