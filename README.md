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
DEV_LOG=<path to the dev server log> pnpm --filter @diyar/web run audit
DEV_LOG=<path to the dev server log> THEME=light pnpm --filter @diyar/web run audit
```

Write `run audit`, not `audit`: from inside `apps/web`, a bare `pnpm audit` is
pnpm's own dependency-vulnerability report, not this script.

### Dependency advisories

```bash
pnpm audit:deps   # fails on any moderate-or-worse advisory
```

Run before a release and whenever dependencies change. It is **not** part of
`pnpm test`, on purpose: it asks the registry, and a test that depends on the
network — or fails an unchanged commit because an advisory was published
overnight — is a test people learn to skip. It was clean on 16 Sep 2026 after
WORK_PLAN §10; a finding since then is new, not inherited.

Each override in `pnpm-workspace.yaml` — Next's copy of postcss, drizzle-kit's
copy of esbuild — says when it may be removed. Check them on every upgrade of
the package that needs them.

Trust the exit code, not a summary of the output. A script that counted
`advisories` in `pnpm audit --json` reported zero when the response came back
empty; the exit code of `audit:deps` did not, and found the one that was left.

**Any pnpm command installs.** In pnpm 11 even `pnpm exec <tool> --help` runs
the dependency check first, and if the lockfile or an override has changed it
installs on the spot — rewriting `node_modules` under whatever is running. After
editing `pnpm-workspace.yaml` or a manifest, stop the dev server and any browser
run first, then install deliberately.

Both suites sign in, and read the one-time codes out of the dev server's log,
which is why they need `DEV_LOG`. Those codes are real credentials for the seeded
accounts; the log is gitignored for that reason.

**Restart the dev server between full runs.** Requesting a one-time code is rate
limited to five an hour per number, and the counters live in the server process
— so the third suite in an hour signs in to nothing and reports a timeout
waiting for the code field. Restarting clears them. The limit is not loosened
for development on purpose: a limiter that is off where it is exercised is a
limiter nobody has ever seen work.

## The HTTP API

The tRPC router is mounted at **`/api/trpc`** (WORK_PLAN 11.1). It exists for the
mobile apps: the web app does not use it, because both halves run in one process
and it calls the router directly through `createCaller`. Same router, same
domain, same validation — only the transport differs.

```bash
curl "http://localhost:3100/api/trpc/catalogue.productBySlug?input=%7B%22slug%22%3A%22ward-al-taif%22%7D"
```

**It is anonymous only.** No cookie is read and no token is accepted yet; bearer
tokens arrive with 11.3. Row-level security is what makes that safe — an
anonymous caller sees live houses and published listings and nothing else.

`API_ALLOWED_ORIGINS` lists **browser** origins allowed to call it from another
domain, comma-separated, empty by default. The native apps send no `Origin` and
need no entry; the web app is same-origin and is allowed without being listed. An
origin that is neither is refused with 403 **before the router runs** — the
request does not execute and then get hidden, it does not execute. Nothing on
this surface ever sends `Access-Control-Allow-Credentials`, which is why a
cross-site request cannot ride on somebody's session cookie.

## Deploying

Copy `.env.example` and fill it in. Every variable there is **required in
production** — the process refuses to start without one, in
`apps/web/src/instrumentation-node.ts`. Three of those refusals are load-bearing:

- **`DATABASE_URL`** — without it the app would open an embedded database on the
  container's disk, which is not shared between instances and does not survive a
  restart. Use the transaction pooler, not the direct connection.
- **`SELLER_SESSION_SECRET` / `OPS_SESSION_SECRET`** — a signing key with a
  default is not a key.
- **A stub provider** — `assertProductionSafe` refuses to boot while the SMS
  sender or the payment gateway is a stub. Cash on delivery is *not* a stub, so
  a COD-only launch is a real product rather than a degraded one; the SMS sender
  still is, which means **seller and operator sign-in cannot go live yet**.

- **Photographs** — production stores them in Cloudflare R2 (decision M-1). The
  local-disk store used in development is a stub and is refused at startup, and
  setting only some of the five `R2_*` variables is refused everywhere.

### Before the first photograph is uploaded

Houses' browsers send photographs **straight to R2** with a URL the server
signed, so the bucket itself needs two things the application cannot configure:

1. **A public custom domain** for reads. Its origin is `R2_PUBLIC_BASE_URL`,
   and because `next.config.mjs` reads it at build time, changing it means a
   rebuild.
2. **A CORS rule allowing uploads from the site**, or every upload fails in the
   browser with an error that names nothing useful:

   ```json
   [
     {
       "AllowedOrigins": ["https://YOUR-SITE-ORIGIN"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   Only `PUT`, only the site's own origin, only `content-type` — the one header
   the upload URL is signed over. Reads go through the public domain and need no
   CORS rule.

A photograph whose row is removed can leave its file behind if the delete after
commit fails, and an upload that is never confirmed leaves one too. The sweep for
those is `docs/DEBT_REGISTER.md` #4.

Migrations are applied by `packages/db`'s `applyMigrations` against the target
database, as a deploy step. Nothing at request time runs one.

### Not ready to deploy

See `docs/DEBT_REGISTER.md` and `docs/OPEN_DECISIONS.md` for the current list,
and the QA report for the state of each surface.
