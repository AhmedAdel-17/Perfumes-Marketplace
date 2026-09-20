# Architecture

Where code goes and what may depend on what. Read with `ENGINEERING_PRINCIPLES.md`.

> **Reconciled 20 September 2026 (task P0.1.4).** This document described six applications,
> a `packages/integrations` adapter package and a `apps/jobs` worker app. **None of them
> exists.** The repository has ONE application and SIX packages. Everything below is now
> marked as either BUILT or PLANNED, and nothing that is merely planned is written in the
> present tense any more.
>
> Sequencing lives in `MASTER_EXECUTION_PLAN.md`, which is the source of truth for what is
> built next. `WORK_PLAN.md` is history.
>
> The reconciliation applies ADR-02 (one application), ADR-05 (own identity), ADR-12
> (mobile deferred) and ADR-13 (forward-only migrations) from
> `docs/architecture/03-architecture-decisions.md`. **All four are still `Proposed`**, and
> ADR-12 carries "founder approval required". They are recorded here as what the repository
> IS and what the plan says comes next — not as decisions taken. Approving them is task
> P0.2.6.

The mobile structure in §3 is the founder-specified layout (1 September 2026) and is
**normative** — extended, never rearranged. It describes an application that does not exist
yet and is deferred behind GATE 8; it is kept because when mobile is built, it is built that
way. The web, backend and jobs layouts mirror the same discipline.

---

## 1. The layer model

Clean / hexagonal architecture. Four rings, dependencies point inward only.

| Ring | Contains | May import |
|---|---|---|
| **Domain** (`packages/domain`) | Entities, value objects, state machines, policies, specifications, domain events, **ports** (interfaces) | Nothing. No framework, ever. |
| **Application** (`packages/domain/services`) | Use-cases orchestrating domain objects through ports | Domain only |
| **Adapters** (`packages/db`, `packages/api/src/providers/*`) | Drizzle repositories, media store (R2 and local disk), one-time-code store, OTP sender, courier — each behind a port | Domain (implements its ports) |
| **Delivery** (`apps/web`, `packages/api`) | Screens, routes, tRPC routers | Application + Domain types |

**There is no `packages/integrations`.** Adapters live beside the router package in
`packages/api/src/providers/`, each one behind a port declared in `packages/domain/ports`
or in `providers/ports.ts`, and each declaring `isStub` so `assertProductionSafe` can refuse
to boot production holding one. Whether they eventually move to their own package is a
packaging question, not an architectural one: the ports are what matter and they already
exist.

If you ever need an arrow to point outward, you have found a missing port.

---

## 2. Repository layout

**What is on disk, 20 September 2026.** One application, six packages.

```
diyar/
├── apps/
│   └── web/            Next.js — marketplace, brand storefronts, /seller and /ops
├── packages/
│   ├── domain/         ⭐ Pure business logic. Zero framework imports.
│   ├── db/             Drizzle schema, migrations, RLS, repository implementations
│   ├── api/            tRPC routers + the provider adapters behind their ports
│   ├── tokens/         tokens.json → Tailwind preset (+ a React Native theme when needed)
│   ├── ui/             Shared primitives and icons.tsx
│   └── i18n/           Copy layer — Arabic now, second locale switchable
├── design-reference/   Finished HTML mockups — the design specification
└── docs/               Founding pack + these documents
```

**What is planned and NOT built.** Named here so nothing above is read as a gap:

| Planned | Where it will live | Gate |
|---|---|---|
| Seller portal, admin/ops | Route groups inside `apps/web` — **not separate apps** (ADR-02) | already built as `/seller` and `/ops` |
| Background jobs (SLA clocks, purges, reserve release) | In-database `pg_boss`/`pg_cron` plus a runner; a separate worker host only if a trigger demands it | P1.1.2; worker host P6.1.4 |
| Buyer and seller mobile apps | `apps/buyer-app`, `apps/seller-app` — Expo, the §3 layout | GATE 8 (P8) |
| Paymob, Bosta adapters | `packages/api/src/providers/` beside the others | P4.4.1, P4.5.1 |

A future split of `/ops` onto its own domain is a Vercel domain mapping plus middleware, not
a new application (ADR-02).

---

## 3. Mobile — normative structure (NOT BUILT; deferred behind GATE 8)

> **Nothing in this section exists.** There is no `apps/buyer-app` and no
> `apps/seller-app`, no Expo, no NativeWind, no Redux Toolkit anywhere in the repository —
> `packages/tokens` has no React Native consumer today. Doc 03 §10 defers native apps until
> "repeat direct usage proves installation improves retention", and
> `MASTER_EXECUTION_PLAN.md` carries that as phase P8, DEFERRED, behind GATE 8. ADR-12 says
> the same and is **awaiting founder approval** (P0.2.6), because it contradicts the
> standing `WORK_PLAN.md` §11–13 sequence.
>
> What DID survive from that sequence, because both serve the web: the HTTP boundary at
> `/api/trpc` (WORK_PLAN 11.1) and the durable one-time-code store (11.2). Bearer tokens
> (11.3) are P8.1.2 and wait with the rest.
>
> The layout below is kept, unchanged and normative, for the day the gate opens. It is a
> specification, not a description.

Applies identically to `apps/buyer-app` and `apps/seller-app` when they exist.

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

## 4. Web — the Next.js application

Same discipline, framework-appropriate shape. **One application** (ADR-02). The seller
portal and the operator console are route groups inside it — `/seller` and `/ops` — sharing
the composition root, the session modules and the design system. They were never separate
apps, and three deployables would have meant three copies of the question "who is calling".

**What is on disk** in `apps/web/src`:

```
src/
├── app/                       # Next.js routes — composition only, thin
├── core/                      # THE composition root — one file per decision
│   ├── api.ts                 #   apiContext() + api(); who is calling, and what may run
│   ├── db.ts                  #   the pool and the per-actor Unit of Work
│   ├── media.ts               #   R2 or the local-disk stub, one per process
│   ├── login-codes.ts         #   the Postgres one-time-code store, one per process
│   └── catalogue.ts           #   ⚠ queries Postgres directly — DEBT #14, paid by P3.4.1
├── features/                  # Feature-scoped server + client components
│   ├── analytics/  apply/  cart/  catalogue/  checkout/  content/  media/
│   ├── ops/  orders/  product/  returns/  reviews/  seller/  shell/  support/
└── instrumentation*.ts        # Startup guards — assertProductionSafe lives here
```

Two differences from the shape §3 specifies for mobile, both deliberate and both recorded.
There is no `common/`: shared pieces live in `packages/ui` and `packages/i18n`, which is
where a second consumer would need them anyway. There is no `design-system/` folder: the
primitives are `packages/ui` and the tokens are `packages/tokens`, so the web app has no
local copy to drift. Skeletons, `loading.tsx` and `error.tsx` are genuinely missing — that
is DEBT #19, paid by P4.1.1.

**Route files are thin.** A `page.tsx` fetches through a server-side domain call and renders
a feature component. It contains no business rules and no data shaping.

**Server components by default.** `'use client'` only where interaction genuinely requires
it, and pushed as far down the tree as possible — a client island, never a client page.

---

## 5. Domain — the core

**What is on disk** in `packages/domain/src`:

```
packages/domain/src/
├── value-objects/       Money, Phone, Address, Slug, Sku, ...
├── state-machines/      order, sub-order, product moderation, seller lifecycle
├── policies/            commission, attribution, payout timing, returns, SLA
├── specifications/      is-publishable, can-review, can-payout, ...
├── ports/               repositories, UnitOfWork, Clock, audit trail, courier
├── services/            settlement, cart, place-order, ...
├── errors/              typed domain errors, never raw strings
├── catalogue/  sellers/  content/  insights/  trust/   aggregate-scoped rules
├── testing/             the contract suites every adapter must pass
└── *.test.ts            architecture.test.ts and dependency-rule.test.ts guard the ring
```

Two folders this document used to promise are **not there**, and their absence is real
rather than cosmetic. There is no `entities/` — the aggregates are grouped by subject
(`catalogue/`, `sellers/`, `content/`) instead, which is a defensible shape and simply not
the one written down. There is no `events/`: **no domain events exist**, and use-case
orchestration currently sits in the tRPC routers rather than in application services. That
is DEBT #15 and #16, and it is paid incrementally as P1 and P3 tasks touch each path.

**Every file here is framework-free and unit-tested**, and that is enforced rather than
asserted: `dependency-rule.test.ts` reads every production module and fails on any
non-relative import or runtime global, and `architecture.test.ts` guards the rest of the
ring. This package is the asset. The apps are replaceable; this is not.

---

## 6. Data and jobs

**What is on disk:**

```
packages/db/
├── migrations/          26 numbered .sql files — versioned, in git, never click-edited
└── src/
    ├── schema/          Drizzle table definitions
    ├── *-repository.ts  Implementations of the domain's repository ports, one per aggregate
    ├── audit-trail.ts   The append-only trail
    ├── connect.ts       Pool + per-actor GUCs; migrate.ts applies migrations
    └── *.contract.test.ts   The domain's contract suites, run against real Postgres
```

RLS policies are **not** a `policies/` folder. They live inside the migration that creates
the table they guard, which is the only place they can be transactional with it, and
`policy-shape.test.ts` reads the migration ledger and fails on a table that forgot one. Seed
fixtures are `apps/web/scripts/seed.ts`, not a package folder.

**Migrations are forward-only (ADR-13).** "Reversible" in `ENGINEERING_PRINCIPLES.md` §6
does not mean a down script — there are none and there will be none. It means every
migration is additive, or two-phase: expand, deploy, and contract in a LATER migration, so
rolling the application back to the previous build never needs a schema rollback. ADR-13
also asks that each file carry a `-- rollback:` note saying how to undo it by hand.
**Today none of the 26 files does** — that is DEBT #21, and it is an hour of writing, not a
design change.

### Jobs — NOT BUILT

There is no `apps/jobs`, no scheduler, no queue and no worker process. `pg_boss` and
`pg_cron` are the chosen mechanism and neither is installed. The consequences are live
today: the analytics retention sweep is written, tested and **called by nothing** (DEBT #5),
reserve release never runs, and SLA clocks are computed on read rather than watched.

The transactional outbox, job ledger and runner are task **P1.1.2**; the SLA watch is
P3.3.1; purges are P3.3.2. When they exist, every job is a **Command**: serialisable,
idempotent, safe to run twice — because a scheduler that cannot re-run a job safely is a
scheduler nobody dares retry.

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

## Never build while the dev server is running

`next build` and `next dev` share `apps/web/.next`. Running the build against a live dev server
corrupts the dev output, and the symptom is not a build error — the pages still serve, they just
stop hydrating. Every client component silently becomes inert: the add-to-bag button stays
disabled, so every product reads as out of stock, and nothing in the logs says why.

Cost the second time it happened: a screenshot run that reported all three seeded products
unavailable. `rm -rf .next` and a restart fixed it in seconds once the cause was recognised.

**Stop the dev server before building.** Both hazards on this page share a shape — one process,
one directory — and both produce symptoms that point anywhere except at the cause.
