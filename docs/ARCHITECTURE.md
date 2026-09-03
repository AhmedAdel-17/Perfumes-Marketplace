# Architecture

Where code goes and what may depend on what. Read with `ENGINEERING_PRINCIPLES.md`.

The mobile structure below is the founder-specified layout (1 September 2026) and is
**normative** — extended, never rearranged. The web, backend and jobs layouts mirror the
same discipline.

---

## 1. The layer model

Clean / hexagonal architecture. Four rings, dependencies point inward only.

| Ring | Contains | May import |
|---|---|---|
| **Domain** (`packages/domain`) | Entities, value objects, state machines, policies, specifications, domain events, **ports** (interfaces) | Nothing. No framework, ever. |
| **Application** (`packages/domain/services`) | Use-cases orchestrating domain objects through ports | Domain only |
| **Adapters** (`packages/db`, `packages/integrations/*`) | Drizzle repositories, Paymob, Bosta, SMS, WhatsApp, storage | Domain (implements its ports) |
| **Delivery** (`apps/*`, `packages/api`) | Screens, routes, tRPC routers, job workers | Application + Domain types |

If you ever need an arrow to point outward, you have found a missing port.

---

## 2. Repository layout

```
scent/
├── apps/
│   ├── web/            Next.js — marketplace + brand storefronts (RSC, SEO)
│   ├── seller/         Next.js — seller portal
│   ├── admin/          Next.js — admin, ops, support + Payload CMS
│   ├── buyer-app/      Expo — iOS + Android
│   ├── seller-app/     Expo — iOS + Android
│   └── jobs/           Workers: SLA clocks, courier polling, payouts, notifications
├── packages/
│   ├── domain/         ⭐ Pure business logic. Zero framework imports.
│   ├── db/             Drizzle schema, migrations, RLS, repository implementations
│   ├── api/            tRPC routers — thin facades over domain services
│   ├── integrations/   Paymob, Bosta, SMS, WhatsApp, email adapters
│   ├── tokens/         tokens.json → Tailwind preset + React Native theme
│   ├── ui/             Shared primitives (web + native variants)
│   └── i18n/           Copy layer — Arabic now, second locale switchable
└── docs/               Founding pack + these documents
```

---

## 3. Mobile — normative structure

Applies identically to `apps/buyer-app` and `apps/seller-app`.

```
src/
├── common/                    # Shared components, hooks, utils, localization
│   ├── components/
│   ├── hooks/
│   ├── utils/
│   └── localization/          # consumes packages/i18n
├── core/
│   ├── api/                   # THE single network boundary — nothing else does I/O
│   ├── store/                 # Redux Toolkit — CLIENT state only (see §3.2)
│   ├── theme/                 # colors.ts, typography.ts, spacing.ts, motion.ts
│   ├── config/                # Env-driven configuration, typed and validated
│   ├── notifications/         # Push registration, handlers, deep-link routing
│   ├── storage/               # Secure storage (tokens), MMKV (cache)
│   └── analytics/             # Event emitter → the doc 04 §6 taxonomy
├── design-system/             # Tokens + branded primitives
│   ├── tokens.ts              # re-exports packages/tokens
│   ├── primitives/            # Text, Button, Surface, Divider, Field, Sheet
│   └── motion/                # Durations, easings, shared transitions
├── features/                  # Feature-scoped logic, hooks and components
│   ├── discovery/
│   ├── product/
│   ├── cart/
│   ├── checkout/
│   ├── orders/
│   ├── reviews/
│   └── account/
├── navigation/                # Auth stack, main tabs, deep links, guards
├── screens/                   # Screen composition ONLY — thin
└── assets/
    └── brand/                 # Logo SVGs, wordmark, app icon, splash
```

`features/` is the one addition to the specified layout. Without it, a 25-screen app puts
feature logic either in `screens/` (which must stay thin) or in `common/` (which then stops
being common). Every folder from the specification is preserved.

### 3.1 The rules that make this structure hold

| Rule | Why |
|---|---|
| **Screens are thin.** They compose feature components and read from hooks. No business logic, no direct API calls, no conditional data shaping. | A screen is a layout decision, not a place where rules live. |
| **`core/api/` is the only place network access happens.** Everything else calls a typed hook. | Dependency Inversion. Swapping transport touches one folder. |
| **`core/store/` holds client state only.** Never server data. | See §3.2 — this is the single biggest debt trap in React Native apps. |
| **`design-system/` never imports from `features/`.** | Direction of dependency. Primitives know nothing about the product. |
| **`features/` never imports from `screens/`.** | Same. |
| **Cross-feature imports go through `common/` or `packages/domain`.** | Prevents the feature graph becoming a mesh. |

### 3.2 State — the hard rule

> **Server data lives in TanStack Query. Client state lives in Redux Toolkit. They never overlap.**

| Kind | Home | Examples |
|---|---|---|
| **Server state** | TanStack Query (via the tRPC client in `core/api/`) | Products, orders, seller catalogue, reviews, payout statements |
| **Client state** | Redux Toolkit (`core/store/`) | Auth session, cart draft, active filters, onboarding progress, locale, notification permission, offline queue |

Copying server data into Redux gives you two caches, manual invalidation, and stale-data
bugs that surface in production as wrong prices. It is the most common and most expensive
form of technical debt in a React Native codebase. It is forbidden here.

*(This revises the earlier "no state library" position, which was written for a
server-rendered website. Native apps have genuine client state; websites mostly do not.)*

---

## 4. Web — Next.js apps

Same discipline, framework-appropriate shape. Applies to `web/`, `seller/`, `admin/`.

```
src/
├── app/                       # Next.js routes — composition only, thin
├── common/                    # Shared components, hooks, utils
├── core/
│   ├── api/                   # tRPC client + server-side callers
│   ├── config/                # Typed, validated env
│   └── analytics/
├── design-system/             # Same primitives, web variants
│   ├── tokens.ts
│   ├── primitives/
│   └── motion/
└── features/                  # Feature-scoped server + client components
    ├── discovery/
    ├── product/
    ├── storefront/
    ├── cart/
    └── checkout/
```

**Route files are thin.** A `page.tsx` fetches through a server-side domain call and renders
a feature component. It contains no business rules and no data shaping.

**Server components by default.** `'use client'` only where interaction genuinely requires
it, and pushed as far down the tree as possible — a client island, never a client page.

---

## 5. Domain — the core

```
packages/domain/src/
├── entities/            Order, SubOrder, LineItem, Product, Seller, Review, Payout
├── value-objects/       Money, Phone, Address, Slug, Sku, Percentage
├── state-machines/      order, sub-order, product-moderation, seller-lifecycle
├── policies/            commission, attribution, payout-timing, returns, sla
├── specifications/      is-publishable, can-review, can-payout, is-eligible-for-return
├── events/              domain events + the event contract
├── ports/               CourierPort, PaymentPort, NotifierPort, repositories, ClockPort
├── services/            use-cases: PlaceOrder, ConfirmSubOrder, GeneratePayout, ...
└── errors/              typed domain errors, never raw strings
```

**Every file here is framework-free and unit-tested.** This package is the asset. The apps
are replaceable; this is not.

---

## 6. Data and jobs

```
packages/db/src/
├── schema/              Drizzle table definitions, one file per aggregate
├── migrations/          Versioned, reversible, in git — never click-edited
├── policies/            RLS policies as code
├── repositories/        Implementations of domain repository ports
└── seed/                Deterministic fixtures for dev and tests

apps/jobs/src/
├── sla/                 Confirmation and dispatch clocks, pre-breach alerts
├── courier/             Tracking event polling, reconciliation
├── payouts/             Reserve release, statement generation, payout runs
├── notifications/       Queue consumers per channel
└── shared/              Command base, retry/backoff, idempotency
```

Every job is a **Command**: serialisable, idempotent, safe to run twice.

---

## 7. Boundary checklist for any new module

Before writing a file, answer these:

1. Which ring does it belong to?
2. Does it import anything from an outer ring? (If yes — stop, you need a port.)
3. Which design pattern applies, from the registry in `ENGINEERING_PRINCIPLES.md` §4?
4. What is its single responsibility, stated in one sentence?
5. Can it be tested without a network, a database or a clock?

If question 5 is "no" for anything in `packages/domain`, the design is wrong.

---

## PGlite: one process, always

The local database is PGlite — a real Postgres compiled to WebAssembly, persisted to
`apps/web/.data/pg`. It is **embedded and single-writer**. Opening that directory from a second
process while the dev server is running does not fail loudly; it corrupts the reader's view.

Found on 3 September 2026, expensively. A debugging script opened `.data/pg` to inspect seeded
rows while `next dev` held it. Afterwards the home page still listed products, but every product
page returned 404 — a three-way join returned zero rows while each of its three tables returned
rows individually. Half an hour went into hunting an RLS bug that did not exist.

**The rules:**

- Never open `.data/pg` from a script while the dev server is running. Stop the server first.
- To inspect data, add a temporary log inside the running server, or stop it and use `pnpm seed`.
- If the database starts behaving impossibly — queries that contradict each other — do not debug
  it. Delete `.data`, re-seed, and see whether the symptom survives a clean baseline. That is one
  command and it eliminates the entire class.

The generalisable lesson is about DEBUGGING, not about PGlite: when a tool has to touch the thing
it is inspecting, rule out the tool before you trust its readings.
