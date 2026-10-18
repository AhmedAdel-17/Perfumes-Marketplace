# Project orientation

Prepared 17 October 2026 from the local workspace. This is a navigation aid, not a new source of requirements or an implementation plan.

## Coverage and limits

The onboarding pass inventoried the repository, inspected documentation headings and source declarations across the main packages, and read selected governing documents and critical execution paths in detail. It is **not a claim that every line of every file has received a detailed review**. Some large command outputs were truncated; those files must not be treated as fully read. Images were inventoried, not visually reviewed. No running application, database, dependency installation, build, or test suite was exercised.

`PROJECT_FILE_INVENTORY.csv` records every file discovered before these onboarding artifacts were added, with its size, line count for text files, category, and SHA-256. A hash establishes the version indexed, not comprehension or correctness. Generated dependency directories and local runtime data are excluded.

The supplied folder has no `.git` directory: `git status` reports that it is not a repository. Remote state, branch protection, commit history, deployment state, and historical test results cannot be independently verified from this copy. References to them below are documentation claims, not checks performed during onboarding.

## Sources of authority

- `CLAUDE.md`: project memory, standing constraints, design amendments, and local runtime hazards. Read before implementation.
- `docs/01_…` through `docs/06_…`: founding business, research, economics, product, founder agreement, and operations references. Preserve these founding documents.
- `DECISION_REGISTER.md`: canonical decision state; supersedes the blueprint decision snapshot. Distinguish an open recommendation from a recorded decision.
- `MASTER_EXECUTION_PLAN.md`: implementation sequencing, dependencies, gates, and completion evidence. `WORK_PLAN.md` is historical.
- `docs/ENGINEERING_PRINCIPLES.md`, `docs/ARCHITECTURE.md`, `docs/TECH_STACK.md`, and `docs/DESIGN_DOCTRINE.md`: engineering and design constraints. Their older descriptive passages can lag current code and dated amendments.
- `docs/DEBT_REGISTER.md`: canonical registered debt. The architecture audit and `docs/product/` retain useful historical findings, some already fixed.
- `docs/PROJECT_MASTER_BLUEPRINT.md`: entry point to strategy documents spanning company, product, customers, sellers, brand, market, economics, operations, data, analytics, legal, AI, and scaling.

When sources disagree, check the dated decision, its implementing code, and the task log before acting. Flag the discrepancy; do not silently reinterpret a historical statement as current policy.

## Business and product

DIYAR / ديار is a curated Egyptian local perfume marketplace combined with a seller operating system. Smaller social-first houses are the initial supply wedge. Customers receive structured fragrance discovery, visible seller identity, clear shipping splits, checkout, tracking, and aftercare. Houses receive storefronts, catalogue tools, order queues, fulfilment records, and statements. Platform operators handle qualification, moderation, support, content, and reporting.

The asymmetric fee model is central: seller-originated demand should incur a lower technology/operations fee than demand the marketplace creates. The founding ranges are hypotheses, not approved final pricing. Orders must eventually carry defensible attribution and snapshotted commercial terms. Completed orders, contribution inputs, direct return, and cross-house purchasing matter more than registrations or raw GMV.

Trust controls include eight seller verification controls, publish requirements, claims moderation, delivery-gated reviews, and audit evidence. The platform owns the customer relationship even when the house owns inventory and fulfilment. Native apps, warehouse operations, international expansion, and AI matching remain gated; their presence in reference designs is not authorization to build them.

## Actual software shape

One pnpm/Turborepo workspace contains one Next.js application and six shared packages. Node >=22 and pnpm 11.25.0 are declared in the root manifest. Package ranges are not the same as resolved lockfile versions; the workspace specifically patches Next 15.5.25.

| Area | Responsibility |
|---|---|
| `apps/web` | Next.js App Router: marketplace, `/seller`, `/ops`, server actions, composition roots, middleware, startup checks |
| `packages/domain` | Framework-free business rules, value objects, state machines, specifications, repository ports, contract cases, in-memory adapters |
| `packages/api` | tRPC procedures, Zod boundaries, authorization, orchestration, errors, rate limits, observability, provider adapters |
| `packages/db` | Drizzle tables, migrations, RLS, PostgreSQL/PGlite connection, repositories, transaction-scoped actor context |
| `packages/i18n` | Arabic/English copy, vocabulary labels, locale paths, six-form Arabic plurals, numerals, dates |
| `packages/tokens` | Design values, semantic theme roles, Tailwind preset, contrast and drift checks, illustration palettes |
| `packages/ui` | Shared exports and icon set; not a general component library |

The dependency rule is the architectural anchor: domain production modules must not import a framework. Adapters implement domain ports. The web composition root chooses dependencies and authority. Some use-case orchestration remains in routers and is registered debt; there is no implemented domain-event/outbox/job system.

### Request and data path

`page or client island → server action/core helper → api().router.procedure → UnitOfWork.transaction → repository → database`.

The web application normally uses tRPC `createCaller` in process. `/api/trpc` exposes the same router over HTTP; documented bearer authentication for future mobile consumers is not implemented. `packages/api/src/routers/index.ts` composes 18 routers: analytics, applications, audit, cart, catalogue, content, contentImages, glossary, insights, listings, orders, photos, platform, returns, reviews, seller, site, and support.

`apps/web/src/core/api.ts` assembles actor identity, seller/staff IDs, transaction providers, media, payout permission, clock, correlation IDs, and error reporting. Anonymous is the default actor. Checkout, aftercare, intake, analytics, and identity use narrow service roles rather than arbitrary per-procedure privilege construction.

`DrizzleUnitOfWork` in `packages/db/src/repositories.ts` sets transaction-local actor GUCs and an optional request ID, then drops to `app_user` before repository work. This step matters because a privileged connection bypasses RLS. The pool driver is selected by the presence of `DATABASE_URL`: postgres-js remotely, PGlite locally. Remote connections disable prepared statements for transaction pooling.

### Routes and frontend ownership

Customer routes include `/`, `/search`, `/p/[slug]`, `/houses`, `/house/[slug]`, `/cart`, `/checkout`, `/order`, `/support`, `/apply`, and CMS pages at `/[slug]`. Seller routes cover orders, listings/editing, returns, and payouts. Operator routes cover work queues, applications/houses, listing moderation, reviews, returns, support, CMS, site curation, notes/glossary, audit, and insights.

`features/` owns interactive and feature-specific pieces; `app/` composes routes; `core/` binds infrastructure and request context. Server components are the default. The cart is a React context persisted to localStorage: it records product IDs, quantities, and last-seen prices, never authoritative totals. The server reprices it for display and again at placement.

## Critical execution paths

### Checkout and fulfilment

`features/checkout/actions.ts` forwards contact/address data and product IDs/quantities to `orders.place`. The procedure validates with Zod, rate-limits the phone, reprices catalogue data, rejects cart adjustments, finds/creates the phone-based customer, loads seller SLA terms, and builds a multi-house order. COD is the only accepted payment method on this path.

One transaction saves the order, sub-orders, and items and transitions each sub-order from `placed` to `awaiting_seller`. Prices, names, sizes, rates, and SLA terms are snapshots. Attribution resolution exists in the domain but the router passes `touches: []`, yielding `unknown` under the current resolver. Commission uses default rules rather than loading negotiated rules from the database.

Seller confirmation and dispatch call the centralized `SubOrderLifecycle`. Dispatch records a manually supplied tracking number and shipment together with the state change. Platform operators record delivery and remittance separately: delivery does not prove receipt of COD cash. Cancel/refuse states exist in the domain table but have no corresponding procedures in the inspected order/seller/platform routers.

Placement idempotency, stock reservation, concurrent transition safety, and complete outcome-to-money reconciliation are recorded gaps. Do not infer production safety from the existence of the state machine or successful arithmetic tests.

### Settlement

`SettlementService` classifies earned, held, reversed, and excluded sub-orders, applies snapshotted commission, accounts for delivery cost bearer, and builds/reconciles itemized statements. Reserve eligibility and cash availability are separate requirements.

`platform.runPayout` has an explicit permission check before reads/writes. The current persisted payout flow is documented as repeatable over already-paid sub-orders; an append-only, exactly-once settlement ledger is planned. The production kill switch defaults off. A reconciled statement does not prove that it has never been paid before. Keep the switch intact until the approved ledger work resolves that defect.

### Identity and security

Seller/operator sign-in uses the application's phone OTP system, not Supabase Auth. OTP digests and guarded verification live in PostgreSQL. Signed browser cookies carry session IDs, while database rows provide expiry, revocation, and principal revalidation. Seller and operator audiences have different cookies/secrets. `core/identity.ts` uses the narrow identity transaction role.

Middleware issues request IDs and CSP nonces and propagates locale/path information. Structured API logs, scrubbed error reporting, and audit request IDs exist. The current log error reporter and OTP senders declare themselves stubs. Startup checks refuse production with stub providers or missing required database/session configuration. Local-disk media is also a refused production stub; R2 is the real media adapter.

### Catalogue, media, trust, and CMS

Catalogue query parsing and Arabic search folding live in domain modules. Public catalogue data is read through an API/read-model seam with RLS. Listing completeness, controlled vocabularies, claims inspection, status transitions, and database publish triggers are separate layers that must agree.

Media uploads are started with a server-signed URL, uploaded directly, then confirmed with server-read image facts. Ownership, alt text, media limits, primary-image rules, and publishability matter together. Product-photo and content-image stores/repositories have different visibility rules. R2 needs external bucket CORS configuration and a public read domain; partial R2 configuration is rejected.

Guest aftercare uses order-reference/phone checks and the aftercare role. Reviews are delivery-gated, have six rating dimensions, and support audited platform moderation. Return cases have their own lifecycle and cost-bearer concepts; a return case being resolved does not establish correct settlement reversal.

The in-house CMS has structured blocks, draft/review/published/archived states, immutable revisions, preview, restore, and media references. Announcements, home curation, and the note glossary are distinct site/content capabilities. Migration 0031 adds operator-assigned scent-note icons.

## Current language and visual decisions

English was approved on 30 September 2026 (D-3). Customer English URLs live under `/en`, rewritten onto the same route files. Arabic uses unprefixed URLs. Locale choice is remembered; untranslated `/seller`, `/ops`, and `/api` stay unprefixed. Missing content translations fall back to Arabic with language/direction attributes. Interface Arabic is Egyptian Arabic; legal text retains simple Modern Standard Arabic.

The default theme is light Laboratoire. Dark Noir was amended on 17 October to Graphite & ambre. Both share layout, typography, and finish; theme differences are colors. Typography follows language: Noto Naskh Arabic headings, IBM Plex Sans Arabic body, Newsreader English headings, IBM Plex Mono labels/data. Older mentions of a dark default, Amiri/Bodoni, theme-specific fonts, or an accent-free Noir are historical.

Read `design-reference/redesign/04-laboratoire.html` for the current layout and tokens for current values. Header references include the selected Atomiseur direction. The latest task log records a customer-focused storefront, seller recruitment in the footer, scent-note icons on home/product surfaces, and motion/control refinements.

Use semantic tokens and logical direction properties. Preserve contrast in both themes, reduced-motion behavior, mixed Arabic/Latin layout, six-form plurals, visible focus, and measured touch targets. The Flacon illustration has a documented artwork exemption in the value guard; it is not permission for raw component colors or new unapproved icons.

## Testing and local execution

Declared commands include `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm guard`, and the web `e2e`/`run audit` scripts. CI defines verification/build, forbidden-value guard, browser, accessibility, and a separate scheduled dependency audit. Test files cover domain behavior, shared repository contracts, real SQL/RLS, API access, vocabulary parity, copy, tokens, and security headers. Historical passing counts are not a fresh result for this workspace.

Important local constraints:

- Do not open `apps/web/.data/pg` from a second process while the server holds it.
- Do not run `next build` while `next dev` owns the same `.next` output.
- `dev` seeds/migrates before starting Turbopack on port 3100.
- pnpm 11 may install/check dependencies during commands; coordinate manifest changes and running processes.
- Browser suites use an OTP outbox outside the repository. Treat it as credentials.
- Fresh full suites may require server restarts because in-process OTP request limits persist.
- The Next dev-runtime patch must be revisited on a Next upgrade.

## Contribution routes by role

| Role | Start here | Check before changing behavior |
|---|---|---|
| Product/business | founding 01–04, decision register, product strategy, red team | evidence quality, success metric, gate, commercial owner |
| UX/brand/copy | doctrine, latest dated FD amendments, redesign references, i18n copy | both languages/themes, current customer-first direction, reference fidelity |
| Frontend | route, corresponding feature, core helper, i18n/tokens | server/client boundary, direction, responsive composition, state coverage |
| Backend/domain | router, domain rules/ports, contract cases | business invariants, injected time, transaction and authorization boundaries |
| Database/security | repository, schema, migration history, RLS tests | unprivileged execution, tenant isolation, snapshots, additive migration strategy |
| QA | acceptance gates, debt register, QA report, tests/scripts | cross-screen agreement, negative access cases, money outcomes, real geometry |
| Operations/finance | founding 06, operations/economics docs, work queue/reporting | reachable states, cash evidence, manual responsibility, payout guard |
| Infrastructure | startup checks, providers, CI, environment example | real adapters, secrets, backup/deployment evidence, runtime ownership |

## Recheck before the next implementation task

Read the complete relevant task and its reference documents, then the affected source/tests/migrations in full. Refresh the decision register and the latest log. Confirm whether the user authorizes an existing task or a new scope. The current first READY entries are predominantly founder/legal/validation work; a README instruction to take the next READY task does not turn a research-only request into implementation authorization.

Remaining onboarding work includes detailed line-by-line reads of the files only structurally scanned, visual inspection of reference/evidence assets when relevant, and runtime verification once requested. This map preserves what was learned without presenting those outstanding checks as complete.
