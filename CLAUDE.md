# CLAUDE.md

Project memory. Read this fully before any task.

---

## 0. Standing directives — never violated, never relaxed

**Founder directive, 1 September 2026.** These outrank convenience, speed and every default
you would otherwise reach for. They apply to every session, every app, every file, for the
life of the project.

1. **Zero technical debt.** Debt is not "fix it later." If something must ship imperfect it
   gets a dated, owned entry in `docs/DEBT_REGISTER.md` — or it does not ship.
2. **Deliberate design patterns.** Before implementing any non-trivial subsystem, name the
   pattern and justify it in the module header. The analysed registry is
   `docs/ENGINEERING_PRINCIPLES.md` §4. Never default; never decide silently.
3. **SOLID, enforced.** See `ENGINEERING_PRINCIPLES.md` §2. The dependency rule (§1) is the
   most important rule in the codebase: **`packages/domain` imports no framework, ever.**
4. **Full SDLC on every change.** Requirement → design → implementation → test → review →
   deploy → observe. No stage skipped because a change "looks small." Definition of Done is
   in `ENGINEERING_PRINCIPLES.md` §3.
5. **Luxury is the product.** The standard is Dior, Saint Laurent, Xerjoff — not "a nice
   app." Restraint, space, typography, one accent, sharp edges, weighted motion, never
   shout. Rules and the per-screen detail checklist: `docs/DESIGN_DOCTRINE.md`. The test is
   *"would Dior ship this screen?"* — and "it's fine" means it is not finished.

### The four documents these live in

| Document | Governs |
|---|---|
| `docs/ENGINEERING_PRINCIPLES.md` | SOLID, SDLC, design-pattern registry, testing, debt policy |
| `docs/ARCHITECTURE.md` | Layers, dependency rule, folder structures (mobile is **normative**) |
| `docs/DESIGN_DOCTRINE.md` | Luxury standard, motion, detail checklist, instant-death list |
| `docs/TECH_STACK.md` | Confirmed stack, reversible choices, platform gotchas |

Read them alongside this file. Where they conflict with each other, `/docs` documents
01–06 win and you should flag the conflict.

---

## 1. What this is

**Project Scent Marketplace** (working name — customer-facing name still open).

A multi-vendor marketplace aggregating selected Egyptian local perfume brands. Each
approved brand gets a **branded storefront and an operating dashboard**; customers
discover, compare and buy across brands through one trusted platform.

> **Executive thesis:** build the trusted commerce and operating layer for Egyptian local
> perfume brands — a focused marketplace for buyers and a practical online-sales system
> for sellers.

**Core model:** a hybrid marketplace **plus seller operating system**. The platform earns
more when it creates incremental demand or performs more operations. It should not tax
seller-owned demand as if it created it. This asymmetry is the heart of the business and
is enforced in code (see §5).

**Supply wedge:** smaller brands selling through shops, Instagram, Facebook or WhatsApp
that lack a capable website or order-management system. Larger online-first brands come
second, attracted by proven demand and transaction data.

The full founding pack is in `/docs` (documents 01–06). It is authoritative. This file
summarises what matters for engineering decisions; when they conflict, `/docs` wins and
you should flag the conflict.

---

## 2. Strategic principles — these constrain engineering

| Principle | What it means in code |
|---|---|
| **Trust before scale** | No open seller self-signup. Approval workflow is required, not optional. |
| **Evidence before code** | Do not build ahead of the phase gates in §9. |
| **Incremental value** | Commission differs by order source. Never a flat rate. |
| **Transparent economics** | Shipping splits, fees and sponsorship are always visible to the user. Never hide a cost. |
| **One customer relationship** | One account, one support route, one tracking surface across all sellers. |
| **Brand independence** | Seller identity stays visible everywhere. Never flatten brands into anonymous SKUs. |
| **Compliance by design** | Verification, privacy, claims moderation, returns and tax workflows are launch work, not later work. |

---

## 3. Product roles

| Role | Job |
|---|---|
| Customer | Discover, compare, buy, track, review |
| Seller owner | Storefront, products, inventory, orders, fulfilment, reporting |
| Seller staff | Assigned operational tasks, **limited permissions** |
| Platform operations | Approve sellers/listings, route support, monitor SLAs |
| Platform admin | Policies, commissions, payouts, promotions, risk |
| Content/category manager | Scent data standardisation, merchandising |

Role-based access is an MVP requirement, not a later addition. Seller staff must not see
what seller owners see.

---

## 4. The catalogue schema

The **normalized Egyptian scent catalogue is a defensible asset** — the code is not.
Treat schema quality as the most important thing in the system.

| Group | Required fields |
|---|---|
| Identity | brand, product name, SKU, seller, status |
| Commerce | price, promotional price, size, stock, fulfilment time |
| Product | concentration, form, gender positioning, scent family, **top/middle/base notes** |
| Use | season, day/night, occasion, projection band, longevity band |
| Compliance | responsible seller, required warnings/label data, product evidence references |
| Media | primary image, gallery, alt text, **image ownership confirmation** |
| Policy | return eligibility, sealed/opened conditions, defect route |
| Attribution | source links, campaigns, creator codes, storefront referral |

**No listing publishes with missing required fields.** Controlled vocabularies only —
free text where an enum belongs is a bug.

Performance descriptions use defined bands and must disclose their source: seller-provided,
platform test, or review aggregate. Never present a seller claim as platform fact.

### Prohibited claims — enforce at validation

No fake designer logos, confusing packaging, false authorisation claims, or unsubstantiated
percentage-similarity claims ("90% identical to X"). Original designer trademarks used as
comparison or search labels require Egyptian legal review — **do not implement designer-name
search or comparison features without explicit sign-off.**

---

## 5. Attribution and commission — the central mechanic

**Every order must be tagged to a source.** Categories: brand storefront/referral link,
organic marketplace search, platform paid campaign, creator/affiliate, direct repeat,
email/CRM, unknown.

| Order source | Working rate |
|---|---|
| Seller-originated | 3–5% technology/operations fee (or subscription alternative) |
| Marketplace-generated | 12–18% of completed net merchandise value |

> **Critical control:** a registered user is **not** automatically a platform-acquired
> customer. Measure where the order originated, and whether the customer later returns
> directly or buys from another brand.

Rates are configurable by source and by seller — never hardcoded. Attribution windows and
dispute handling are policy values in the admin, not constants in code.

**Commission is charged only on completed orders.** Refused and returned orders have
defined, separate treatment.

---

## 6. Order lifecycle

```
Placed → Awaiting seller → Confirmed → Dispatched → Delivered
                ↓              ↓            ↓
           (rejected)    (cancelled)  (refused / returned)
```

- **Placed** — platform validates payment/contact, routes seller sub-order.
- **Awaiting seller** — seller confirms inventory against an SLA clock; alert before breach.
- **Confirmed** — seller prepares; dispatch SLA by seller and service area.
- **Dispatched** — tracking and customer notice; courier event monitoring.
- **Delivered** — close order, start payout and return window, **enable review**.

**Only delivered orders can produce verified-purchase reviews.** This is an acceptance gate.

**Cancelled, refused, returned and failed-payment states must reconcile correctly** — this
is the hardest requirement in the MVP and the most important to test.

### Money flow

Order placed (method + seller split recorded) → seller confirms → dispatch and tracking →
platform reconciles merchandise, shipping, discounts, fees, adjustments → payout on a fixed
schedule after a defined reserve/return period → **every payout has an itemized statement
and a dispute deadline**.

Do not implement platform-held balances, split settlement, or COD handling without confirmed
legal and PSP review. Flag it rather than assuming.

---

## 7. Multi-seller cart

A single customer order can span several sellers. This is a real requirement, not an edge
case.

- Shipping splits and total cost **visible before payment**.
- One order splits into per-seller sub-orders with independent SLAs and states.
- Customer sees one tracking surface; sellers see only their own sub-order.
- Do not subsidise multi-seller shipping — the cost must be visible and measured.

---

## 8. Non-functional requirements

| Area | Requirement |
|---|---|
| **Security** | Strong auth for admins/sellers, least privilege, secure secrets, **audit logs**, vulnerability management |
| **Privacy (PDPL 151/2020)** | Consent and purpose records, minimal collection, retention rules, export/delete request process |
| **Availability** | Monitoring, backups, recovery objectives; graceful payment/courier failure handling |
| **Performance** | Mobile-first; measured product/search/checkout performance **on common Egyptian connections** |
| **Scalability** | Supports sellers and SKUs without premature microservice complexity |
| **Accessibility** | Keyboard use, contrast, labels, readable content, image alt text |
| **Observability** | Central logs, errors, **order/payment/courier correlation**, alert ownership |
| **Data quality** | Required fields, controlled vocabularies, duplicate checks, moderation audit |

**Admin actions, fee changes and payout adjustments must be auditable.** Build the audit
trail from the start; retrofitting it is not feasible.

---

## 9. Phases — do not build ahead of these gates

| Phase | Deliverable | Exit condition |
|---|---|---|
| **0 — Validation** | Manual catalogue/storefront pilot, operational scripts | **Real seller-routed completed orders** |
| **1 — MVP** | Responsive marketplace, seller portal, admin, checkout, order flow | Stable pilot, controlled exceptions |
| **2 — Growth** | Better search, loyalty, referrals, campaigns, analytics | Repeat/direct traffic, positive contribution |
| **3 — Fulfilment** | Selected inventory, combined shipping | Order density proves economics |
| **4 — App/experience** | Native app, sampling, showroom, subscription | Clear retention or operational case |

### Explicitly deferred — do not build

Native iOS/Android apps · central warehouse · showroom or sample bar · AI scent matching
before sufficient data · **open seller self-approval** · unverified similarity claims ·
international expansion · complex loyalty points redemption.

### Commercial decision gates

- Do not subsidise multi-seller shipping until contribution impact is measured.
- Do not build an app until repeat direct usage proves installation improves retention.
- Do not promise payouts faster than payment/COD reconciliation safely permits.
- Do not report GMV growth alone — contribution margin and cash conversion.

---

## 10. Analytics events — define before implementing

| Funnel | Events |
|---|---|
| Acquisition | `landing_view`, `source_attributed`, `storefront_view`, `campaign_click` |
| Discovery | `search`, `filter_apply`, `product_view`, `comparison_view`, `wishlist_add` |
| Purchase | `cart_add`, `checkout_start`, `payment_select`, `order_place`, `order_confirm` |
| Fulfilment | `seller_accept`, `seller_reject`, `dispatch`, `delivery_attempt`, `delivered`, `refused`, `returned` |
| Retention | `review_submit`, `reorder`, `direct_return`, `cross_brand_purchase`, `referral_complete` |
| Seller | `listing_publish`, `stockout`, `SLA_breach`, `payout_complete`, `campaign_participate` |

Every event carries: timestamp, anonymous/user ID (as lawful), seller/brand/SKU, **order
source** and campaign fields.

**Write the analytics definitions before implementing them.** Contradictory dashboards are
the predictable failure here.

---

## 11. MVP acceptance gates

The MVP is done when all of these pass:

1. A seller can be approved, publish a valid product, receive an attributed order, and view its statement.
2. A customer can understand total shipping and complete COD/e-payment checkout **without hidden costs**.
3. An order split across sellers produces correct seller tasks and customer tracking.
4. Cancelled, refused, returned and failed-payment states reconcile correctly.
5. Only delivered orders can create verified-purchase reviews.
6. Admin actions, fee changes and payout adjustments are auditable.
7. Privacy, terms, seller agreement, return policy and prohibited-product controls are live.
8. The business founder can see funnel, seller SLA and contribution inputs **without database work**.

Feature count is not success.

---

## 12. The design is already done — match it

`/design-reference/` contains finished HTML mockups. **These are the specification.**

| File | Screen |
|---|---|
| `maison2.html` | Home / marketplace browse |
| `product.html` | Product detail, incl. notes visualisation |
| `ALL.html` | All screens, tabbed |

Open the matching reference and **match it exactly** — colours, spacing, type sizes, SVG
paths, layout. Do not redesign or "improve". If something looks wrong, say so and ask.

Icons are in `src/icons.tsx` (40 components). Never draw a new one without asking.

**Not yet designed** — ask before inventing a visual language for these: seller portal,
admin, cart/checkout, order tracking, review submission, seller onboarding, **both mobile
apps, the CMS, the support console and the BI dashboard.**

Where a design does not yet exist, `docs/DESIGN_DOCTRINE.md` is the standard to design
against — not a generic app aesthetic. Design capacity, not engineering capacity, is the
binding constraint on this project.

---

## 13. Stack

**Full confirmed stack: `docs/TECH_STACK.md`. Structure: `docs/ARCHITECTURE.md`.**

Monorepo (pnpm + Turborepo) · TypeScript everywhere · Next.js App Router for all web
(marketplace, seller portal, admin) · **Expo for both mobile apps** (buyer + seller) ·
PostgreSQL via Supabase with **Drizzle** and RLS · tRPC internally, REST for webhooks ·
Tailwind on web, NativeWind on mobile, both driven by `tokens.json` · `pg_boss`/`pg_cron`
for jobs · Paymob · Bosta · Vercel · Expo EAS.

### Amendments to the original rules (1 September 2026, on the record)

The original "no ORM, no state library" rule was written for a single server-rendered
website. Scope now includes two native apps, so:

- **Drizzle is permitted** — it is typed SQL, not an ORM. Nothing hidden, no generated
  queries, migrations in git. With ~25 tables of money logic, hand-written SQL with no type
  checking is itself technical debt.
- **Redux Toolkit is permitted on mobile, for client state only.** Auth session, cart draft,
  filters, onboarding progress, locale. **Server data lives in TanStack Query and never
  enters the store** — two caches is the most expensive debt trap in a React Native app.

Everything else stands: no component kit, no search service, no separate backend framework,
no Redis, no GraphQL, no microservices. **No new dependency without written justification**
(what it does, what it replaces, its size, its maintenance status, the cost of removing it).
Default answer to "should we add a library" is still no.

---

## 14. Engineering constraints

### Design tokens only
Everything from `src/tokens.json` via `tailwind.config.ts` and `globals.css`. Never
hardcode a colour, size, spacing value or radius. If a token is missing, ask.

### Arabic-first, RTL-native
`dir="rtl"` and `lang="ar"` are defaults. **Never** `ml-*`, `mr-*`, `left-*`, `right-*`,
`text-left`, `text-right` — logical properties only (`ms-*`, `me-*`, `ps-*`, `pe-*`,
`start-*`, `end-*`). Test with mixed content: `عطر Cozy بسعر 450 جنيه`. Flip directional
icons; never flip logos or real-world objects. Progress and intensity meters fill from the
right. Verify per component, not in a later QA pass.

*(English support is an open decision in doc 01 — build the copy layer so a second locale
is possible, but do not implement English until decided.)*

### Accessibility floor — audited, not aspirational
44pt minimum hit area (visual size may be smaller). 11pt minimum reading text. 4.5:1
minimum contrast — never a grey lighter than `#8B837A` on noir. Visible focus.
`prefers-reduced-motion` respected. Never colour alone to carry meaning.

### Performance
Server components by default. `next/image` with correct `sizes`. Check bundle impact.
Target LCP under 2.5s throttled.

### SEO
Product and brand storefront pages server-rendered with metadata and product structured
data. Storefronts are an acquisition surface — sellers link to them from social bios.

---

## 15. Typography

**Amiri** — Arabic headings only. **Bodoni Moda** — Latin small-caps labels only, always
letterspaced. **IBM Plex Sans Arabic** — everything else. Arabic needs more line-height
than Latin; set the scale for Arabic first.

---

## 16. Egyptian commerce specifics

- **Guest checkout policy is an open decision** in doc 04 — implement guest checkout, keep
  the requirement configurable.
- **Phone number is the primary customer identifier**, not email.
- Addresses: governorate → city → area → street. **No postal codes.**
- **COD is a first-class payment method**, not an afterthought. Failed delivery is a real
  cost line — track refusal rates per seller and per area.
- Prices in EGP.
- Initial service area: Cairo/Giza (working assumption). Do not promise nationwide before
  courier tests.

---

## 17. Code conventions

TypeScript strict, no `any` · server components by default · `'use client'` only when
needed · named exports · Zod at every API boundary · errors surfaced to the user in Arabic,
never swallowed · comments explain *why*, not *what*.

---

## 18. How to work here

1. **One feature per session.**
2. **Plan before code** on anything non-trivial. Show the plan, wait for approval.
3. **Ask when the spec is ambiguous** — several decisions in `/docs` are explicitly open.
4. **Run build and typecheck before saying a task is done.**
5. Payment, order-state and payout logic need tests. These are money paths.
6. Small, focused commits.

### Change control (from doc 04)

Every proposed feature must state: the user problem, the evidence, the success metric, the
operational owner, the legal dependency and the cost.

**Neither founder unilaterally changes marketplace economics, customer policy, or
security-critical architecture.** If a task would do any of those, stop and say so.
