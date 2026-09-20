# Current technology stack — as installed, 18 September 2026

What is actually in `pnpm-lock.yaml` and imported by production code. Compared against
`docs/TECH_STACK.md` (the intended stack) in the last section.

## Runtime and language (FACT)

| Layer | In use | Version |
|---|---|---|
| Language | TypeScript, strict, ESM everywhere | 5.7 |
| Runtime | Node | ≥22 (CI: 22) |
| Package manager | pnpm workspaces + Turborepo | pnpm 11.25, turbo 2.3 |
| Web framework | Next.js App Router, React Server Components, server actions, `typedRoutes` | Next 15.1 / React 19 |
| Styling | Tailwind 3.4 driven by `@diyar/tokens` preset; role-based theme (noir/paper) | — |
| Fonts | `next/font/google`: Amiri 400, Bodoni Moda 400, IBM Plex Sans Arabic 400/500/600 | self-hosted |
| API | tRPC v11 (`@trpc/server` 11.x rc) — in-process caller for web, fetch adapter at `/api/trpc` | — |
| Validation | Zod 3.24 at every router input | — |
| Database access | Drizzle ORM 0.45 (typed SQL), `postgres` 3.4 driver in prod, PGlite 0.5 embedded in dev/test | — |
| Database | PostgreSQL (PGlite = real Postgres in WASM locally; Supabase intended, not provisioned) | PG 16/17 |
| Object storage | Cloudflare R2 via `aws4fetch` presigned PUT (prod); local disk (dev) | aws4fetch 1.0.20 |
| Tests | Vitest 4.1 (unit, contract, RLS, gates), Playwright 1.62 (browser), axe-core 4.13 | — |
| Jobs / queue | **none** | — |
| Cache | **none** (no Redis by policy; nothing else either) | — |
| Auth | Own phone + one-time code, HMAC-SHA256 signed cookies; codes stored as SHA-256 digests in Postgres (`login_codes`, `SECURITY DEFINER` functions) | — |
| Payments | `cashOnDelivery` gateway (real, COD only). No PSP | — |
| Courier | `manualCourier` (tracking number typed by the house). No Bosta | — |
| SMS / WhatsApp / email / push | **none** — `consoleOtpSender` prints the code | — |
| Error monitoring / logging / tracing | **none** — two `console.error` calls | — |
| Analytics | first-party `analytics_events` table, anonymous cookie, no third-party script | — |
| CMS | own content tables + block editor in the ops console (decision TECH_STACK §11) | — |
| Search | Postgres `LIKE` over a normalised `search_text` column (Arabic variant folding in domain) | — |
| Hosting / CI | GitHub Actions workflow file exists; **no remote, no Vercel, no Supabase project** | — |

## Dependency footprint (FACT)

Runtime dependencies across all packages: `next`, `react`, `react-dom`, `@trpc/server`,
`zod`, `drizzle-orm`, `postgres`, `@electric-sql/pglite`, `aws4fetch`. That is nine. The
"no new dependency without justification" rule (CLAUDE.md §13) has been honoured.

Two `pnpm-workspace.yaml` overrides lift advisories in Next's `postcss` and drizzle-kit's
`esbuild`; each states its removal condition.

## Intended vs installed (FACT vs `docs/TECH_STACK.md`)

| Concern | TECH_STACK.md says | Repository has | Assessment |
|---|---|---|---|
| Apps | web, seller, admin (3 Next apps) + 2 Expo apps + jobs | one Next app with `/seller` and `/ops` route groups | **Keep one app** for MVP; update the doc (REC, ADR-02) |
| Auth | Supabase Auth, phone OTP | own OTP + HMAC cookies, no Supabase Auth | Own implementation is sound and already RLS-integrated; **record as a decision** (ADR-05) |
| Storage | Cloudflare R2 (M-1) | R2 adapter built and tested | matches |
| Jobs | `pg_boss` + `pg_cron` | nothing | gap; `pg_boss` needs a long-lived worker Vercel does not provide — see `10-infrastructure.md` |
| Realtime | Supabase Realtime for seller queue | polling on page load only | defer; not an MVP need |
| Payments | Paymob | none | gap (P1) |
| Shipping | Bosta behind `CourierPort` | port exists, manual adapter only | gap (P1) |
| SMS | SMSMisr / Victory Link, Twilio fallback | stub | **blocks seller/ops sign-in going live** (P0) |
| WhatsApp / email / push | Meta Cloud API / Resend / Expo | none | gap (P0 for order notifications, at least one channel) |
| Monitoring / BI | Sentry / Metabase | none | gap (P0 Sentry; BI is `/ops/insights` for now) |
| Mobile | Expo ×2, NativeWind, Redux Toolkit | `@diyar/tokens/native` theme export only | **deferred by doc 04 §10** — see `04-gap-analysis.md` |
