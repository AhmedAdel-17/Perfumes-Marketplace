# Project structure — as it exists on 18 September 2026

Phase 0 ingestion. Every statement here was verified against the working tree at commit
`4450d78` plus five uncommitted files (the login-code wiring for WORK_PLAN 11.2). Nothing
is inferred from a filename; imports, routes and migrations were followed.

**Legend used across the whole audit package**

| Tag | Meaning |
|---|---|
| **FACT** | Observed in the repository |
| **REQ** | Stated in founding documents 01–06 |
| **REC** | Architecture recommendation |
| **ASSUMPTION** | Unverified; must stay labelled |
| **RISK** | A way this can go wrong |
| **IDEA** | Future possibility, not a requirement |

---

## 1. Monorepo layout (FACT)

```
diyar/
├── apps/
│   └── web/                     ONE Next.js 15 app: shopfront + seller portal + ops console + HTTP API
│       ├── src/app/             36 route files (see §3)
│       ├── src/core/            api.ts (composition root), db.ts, catalogue.ts, media.ts, login-codes.ts
│       ├── src/features/        analytics, apply, cart, catalogue, checkout, content, media, ops,
│       │                        orders, product, returns, reviews, seller, shell, support
│       ├── src/instrumentation*.ts   production start-up guard
│       ├── scripts/             seed.ts, e2e.mjs (Playwright, ~130 scenarios), audit.mjs (axe/RTL/44pt), shots.mjs
│       └── .data/               embedded PGlite database + local media (gitignored)
├── packages/
│   ├── domain/                  pure TypeScript, zero dependencies — 33 test files, 485 cases
│   ├── db/                      Drizzle schema (12 files), 26 SQL migrations, repositories, RLS — 193 cases
│   ├── api/                     tRPC v11 routers (17), providers (OTP, payment, courier, media, login codes),
│   │                            HTTP boundary, rate limiter, error mapping — 241 cases
│   ├── i18n/                    Arabic copy, six-form pluraliser, numerals, state labels — 50 cases
│   ├── tokens/                  tokens.json → Tailwind preset + theme roles + native theme — 31 cases
│   └── ui/                      icons.tsx only (40 SVG components)
├── design-reference/            12 HTML mockups (the visual specification)
├── docs/                        founding pack 01–06 + engineering docs + this package
├── .github/workflows/ci.yml    typecheck · test · grep guards — listens on `main`
├── WORK_PLAN.md, QA_REPORT.md, README.md, CLAUDE.md
└── pnpm-workspace.yaml, turbo.json, tsconfig.base.json
```

**Size:** ~65k lines including tests and the Drizzle snapshot; ~30k lines of production
TypeScript/SQL. 70 commits, 4–16 September 2026. No git remote configured.

**What the engineering docs describe but does not exist (FACT):** `apps/seller`,
`apps/admin`, `apps/buyer-app`, `apps/seller-app`, `apps/jobs`, `packages/integrations`.
`ARCHITECTURE.md` §2 and `TECH_STACK.md` §1 describe a six-app layout; the repository has one
app with three route groups. This is a documentation drift, not a defect in the code.

---

## 2. Package dependency graph (FACT)

```
apps/web ──► @diyar/api ──► @diyar/domain
   │             │  └──────► @diyar/db ──► @diyar/domain
   │             └─────────► @diyar/i18n ──► @diyar/domain
   ├──────────► @diyar/db          ⚠ direct (see below)
   ├──────────► @diyar/domain
   ├──────────► @diyar/tokens, @diyar/ui, @diyar/i18n
   └──────────► drizzle-orm, @electric-sql/pglite   ⚠ direct
```

The domain's zero-dependency rule is **enforced by two test files**
(`architecture.test.ts`, `dependency-rule.test.ts`) that parse every production source for
foreign imports, Node built-ins, `new Date()` and floating-point money. This holds.

**Layering breach (FACT):** the web app imports `@diyar/db` and `drizzle-orm` directly in
five files and runs queries as the connection owner (RLS bypassed):

| File | What it does directly |
|---|---|
| `apps/web/src/core/catalogue.ts` (405 lines) | every public catalogue read: home grid, product page, house page, houses directory, search |
| `apps/web/src/features/seller/actions.ts` | resolves phone → house for sign-in; revalidates session per request |
| `apps/web/src/features/ops/actions.ts` | resolves phone → platform staff; revalidates session |
| `apps/web/src/core/login-codes.ts` | composition root for the Postgres login-code store (acceptable) |
| `apps/web/src/core/db.ts` | connection composition root (acceptable) |

The first three bypass the tRPC facade and the `app_user` role. The catalogue one also
carries its own Arabic label tables, duplicating `@diyar/i18n`.

---

## 3. Route inventory — `apps/web/src/app` (FACT)

| Surface | Routes | Auth |
|---|---|---|
| Shopfront | `/` `/search` `/p/[slug]` `/house/[slug]` `/houses` `/cart` `/checkout` `/order` `/support` `/apply` `/[slug]` (CMS pages) `/not-found` | anonymous |
| Seller portal | `/seller` (sign-in) `/seller/orders` `/seller/listings` `/seller/listings/[id]` `/seller/returns` `/seller/payouts` | HMAC cookie `diyar_seller`, 12h |
| Operations console | `/ops` (sign-in) `/ops/queue` `/ops/moderation` `/ops/reviews` `/ops/returns` `/ops/support` `/ops/houses` `/ops/content` `/ops/content/[id]` `/ops/content/[id]/preview` `/ops/site` `/ops/audit` `/ops/insights` | HMAC cookie `diyar_ops`, 4h; `/ops/insights` admin role only |
| API | `/api/trpc/[trpc]` (GET/POST/OPTIONS, anonymous only) | none yet |
| Dev only | `/dev-media/[...key]` | local media store |

Pages are server components that call server actions (`features/*/actions.ts`), which call
`api(actor)` — an in-process tRPC caller — or, in the three cases above, the database.
Client islands: cart store (localStorage), checkout form, listing form, photo manager,
queues, editors, theme toggle.

---

## 4. Domain package map (FACT)

```
packages/domain/src/
├── value-objects/   money.ts (integer piastres, basis points), address.ts (27 governorates, no postcode)
├── state-machines/  sub-order.ts — 9 states, 9 transitions, actors + reason codes
├── policies/        commission.ts (Strategy+Registry; DEFAULT_RULE_SET), attribution.ts (Chain of Responsibility)
├── services/        cart.ts (server-side pricing), place-order.ts (Builder), settlement.ts,
│                    settlement-classify.ts, order-reference.ts
├── specifications/  isPublishable, canReview, HasNoProhibitedClaims (composable)
├── catalogue/       listing lifecycle, completeness gaps, claims (prohibited-claim scanner),
│                    Arabic search normalisation, media/photo-set rules, 11 vocabularies
├── trust/           review.ts, return-request.ts (7-state return lifecycle), support.ts
├── sellers/         application.ts (intake rules)
├── content/         CMS block schema, page lifecycle, announcements
├── insights/        owner-metrics.ts, pre-order-funnel.ts, browsing-events.ts, report-period.ts (Cairo days)
├── ports/           ~25 repository/contract interfaces + contract test suites both adapters must pass
├── testing/         in-memory-repositories.ts (1,754 lines) — the second adapter
└── errors/          typed DomainError with stable codes
```

Missing relative to `ARCHITECTURE.md` §5: `entities/` (records live in ports), `events/`
(no domain events exist), policies for `payout-timing`, `returns`, `sla` (returns rules are in
`trust/`; SLA is a column and a countdown; payout timing is `reserveDays` per seller).

---

## 5. Database package map (FACT)

`packages/db/src/schema/` — 36 tables across identity, sellers, catalogue, orders, fulfilment,
money, trust, governance, content, site, login-codes. Full ER diagram in
`06-data-architecture.md`.

`packages/db/migrations/` — 26 forward-only SQL files (`0000` … `0025`), applied by
`applyMigrations` into a sealed `schema_migrations` ledger. **No down migrations.**

Repositories: one file per aggregate implementing the domain ports; `DrizzleUnitOfWork`
opens a transaction, sets `app.actor_role`/`app.actor_id` GUCs, `SET LOCAL ROLE app_user`,
and hands repositories to the use-case. Nine actor roles: `anon customer seller platform
checkout aftercare intake analytics identity`.

---

## 6. API package map (FACT)

17 routers, 74 procedures: 21 `publicProcedure`, 26 `sellerProcedure`, 27
`platformProcedure`, 0 `customerProcedure` in use (customers are guests).

Providers: `consoleOtpSender` (stub), `cashOnDelivery` (real, COD only), `manualCourier`
(real: a person types a tracking number), `r2MediaStore` / `localMediaStore` (stub),
`postgresLoginCodes` / in-memory double. `assertProductionSafe` refuses to boot production
holding any `isStub: true` provider.

Cross-cutting: `rate-limit.ts` (in-process fixed window, 7 rules), `errors.ts`
(domain error → tRPC error with Arabic copy), `http.ts` (fetch adapter, origin allow-list,
refuses foreign origins before the router runs), `validation.ts` (Zod, Egyptian phone).

---

## 7. Tooling and quality gates (FACT)

| Gate | State |
|---|---|
| `pnpm typecheck` | strict TS in all six packages; `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| `pnpm test` | 1,000 unit/contract/RLS/gate cases (domain 485, api 241, db 193, i18n 50, tokens 31) |
| Browser suite | ~130 Playwright scenarios in `e2e.mjs`, needs a running dev server and its log (OTP codes) |
| Accessibility/RTL audit | `audit.mjs`: axe WCAG 2AA, 44pt targets, RTL fill edges, focus rings, heading order, both themes, six widths |
| CI | GitHub Actions: typecheck + test + grep guards (no hex outside tokens, no physical-direction utilities). **Triggers on `main`; the branch is `master`; there is no remote.** |
| Lint | none (`pnpm lint` runs nothing) |
| Dependency audit | `pnpm audit:deps`, manual; clean on 16 Sep 2026 |

---

## 8. Configuration and environments (FACT)

One environment: a developer laptop. `DATABASE_URL` absent → PGlite embedded Postgres;
present → `postgres-js` pool. Required in production: `DATABASE_URL`,
`SELLER_SESSION_SECRET`, `OPS_SESSION_SECRET`, five `R2_*` variables. `API_ALLOWED_ORIGINS`
optional. `SMS_PROVIDER_KEY`, `PAYMOB_API_KEY`, `BOSTA_API_KEY` are listed but nothing reads
them. No staging, no production, no Vercel project, no Supabase project referenced anywhere.
