# DIYAR — ديار

Monorepo for the Egyptian local-fragrance marketplace.

Governing documents live in `docs`:

| Document | Governs |
|---|---|
| `ENGINEERING_PRINCIPLES.md` | SOLID, SDLC, design-pattern registry, testing, debt policy |
| `ARCHITECTURE.md` | Layers, the dependency rule, folder structures |
| `DESIGN_DOCTRINE.md` | Luxury standard, motion, detail checklist |
| `TECH_STACK.md` | Confirmed stack |
| `OPEN_DECISIONS.md` | What is NOT decided, and what it blocks |

## The rule that matters most

```
apps  →  api  →  domain  ←  adapters (db, paymob, bosta, sms, whatsapp)
                    ↑
             depends on NOTHING
```

`packages/domain` imports no framework. Ever.

It is checked by `packages/domain/src/dependency-rule.test.ts`, which reads every
production module in the package and fails on any import that is not relative,
and on any use of a runtime global. This line used to say "checked by lint" —
there was no linter, and `pnpm lint` exited zero having run nothing.

## Commands

```bash
pnpm install
pnpm test
pnpm typecheck
```

## Running it locally

```bash
pnpm install
pnpm --filter @diyar/web dev
```

`dev` seeds before it starts the server, and the seed applies any pending
migrations. That order is deliberate: the dev server opens the database and
never migrates it, so pulling a new migration and running `next dev` used to
give a schema one migration behind and a 500 naming a column that does not
exist, with nothing anywhere saying a migration was pending.

No Docker, no connection string. With no `DATABASE_URL` the app opens an
embedded Postgres (PGlite) under `apps/web/.data` — the same migrations,
triggers and row-level security policies that run in production.

To start from nothing: `pnpm --filter @diyar/web seed -- --fresh`.

## Checks

```bash
pnpm typecheck   # every package
pnpm test        # unit, contract, RLS, acceptance-gate and API tests
pnpm build       # production build

# Browser suite and accessibility audit — need the dev server running
DEV_LOG=<path to the dev server log> pnpm --filter @diyar/web e2e
pnpm --filter @diyar/web audit
THEME=light pnpm --filter @diyar/web audit
```

The end-to-end suite reads one-time codes out of the dev server's log, which is
why it needs `DEV_LOG`. Those codes are real credentials for the seeded
accounts; the log is gitignored for that reason.

**Restart the dev server between full runs.** Requesting a one-time code is rate
limited to five an hour per number, and the counters live in the server process
— so the third suite in an hour signs in to nothing and reports a timeout
waiting for the code field. Restarting clears them. The limit is not loosened
for development on purpose: a limiter that is off where it is exercised is a
limiter nobody has ever seen work.

## Deploying

Copy `.env.example` and fill it in. Every variable there is **required in
production** — the process refuses to start without one, in
`apps/web/src/instrumentation.ts`. Three of those refusals are load-bearing:

- **`DATABASE_URL`** — without it the app would open an embedded database on the
  container's disk, which is not shared between instances and does not survive a
  restart. Use the transaction pooler, not the direct connection.
- **`SELLER_SESSION_SECRET` / `OPS_SESSION_SECRET`** — a signing key with a
  default is not a key.
- **A stub provider** — `assertProductionSafe` refuses to boot while the SMS
  sender or the payment gateway is a stub. Cash on delivery is *not* a stub, so
  a COD-only launch is a real product rather than a degraded one; the SMS sender
  still is, which means **seller and operator sign-in cannot go live yet**.

Migrations are applied by `packages/db`'s `applyMigrations` against the target
database, as a deploy step. Nothing at request time runs one.

### Not ready to deploy

See `docs/DEBT_REGISTER.md` and `docs/OPEN_DECISIONS.md` for the current list,
and the QA report for the state of each surface.
