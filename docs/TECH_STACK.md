# Technology Stack

Confirmed 1 September 2026. Exact versions pinned at project setup.

> **Reconciled 20 September 2026 (task P0.1.4).** Three things in this document were not
> true of the repository: it named three web applications where there is one (ADR-02), it
> named Supabase Auth where the product has its own phone-OTP identity (ADR-05), and it
> listed a `packages/integrations` that does not exist. Mobile is deferred behind GATE 8
> (ADR-12) and is marked so rather than removed. Rows now say **BUILT** or **PLANNED**.
>
> The ADRs are in `docs/architecture/03-architecture-decisions.md` and are all still
> `Proposed`; approving them is task P0.2.6. What is written here is the repository as it
> is, and `MASTER_EXECUTION_PLAN.md` is the source of truth for what comes next.

**One line:** TypeScript everywhere · Next.js for all web · PostgreSQL on Supabase · one
shared package holding all money logic · Expo for both mobile apps **when GATE 8 opens**.

---

## 1. Applications

| Surface | State | Built with | Hosted on |
|---|---|---|---|
| Marketplace website | **BUILT** | Next.js (App Router) + React + TypeScript + Tailwind | Vercel (P1.4.4) |
| Brand storefronts | **BUILT** | Same app, own routes and metadata | Vercel |
| Seller portal | **BUILT** | Same app, the `/seller` route group — **not a separate app** (ADR-02) | Vercel |
| Admin + CMS | **BUILT** | Same app, the `/ops` route group; content tables in the console (§11) | Vercel |
| Buyer mobile app | **PLANNED — GATE 8** | Expo (React Native) — iOS + Android | App Store / Play |
| Seller mobile app | **PLANNED — GATE 8** | Expo (React Native) — iOS + Android | App Store / Play |

**One deployable, three route groups.** This document used to describe three Next.js
applications; there has only ever been one, sharing a composition root, the session modules
and the design system. Splitting `/ops` onto its own domain later is a Vercel domain mapping
plus middleware, not a new app (ADR-02).

When the mobile apps are built they are two separate store listings, not one binary. They
share packages, not an app. Neither exists today — doc 03 §10 defers them until repeat
direct usage proves installation improves retention, and that is phase P8 in
`MASTER_EXECUTION_PLAN.md`.

---

## 2. Shared packages

| Package | Contents |
|---|---|
| `domain` ⭐ | Order state machine, attribution, commission, money. Pure TypeScript, zero framework imports. |
| `db` | Drizzle schema, migrations, RLS policies, repository implementations |
| `api` | tRPC routers — thin facades over domain services — **and the provider adapters**, in `src/providers/` |
| `tokens` | `tokens.json` → Tailwind preset (a React Native theme when GATE 8 opens) |
| `ui` | Shared primitives and `icons.tsx` — web variants only so far |
| `i18n` | Copy layer — Arabic now, second locale switchable |

**There is no `integrations` package.** Paymob, Bosta, SMS, WhatsApp and email were listed
here and never built. What exists lives in `packages/api/src/providers/`: the media store
(R2 and a local-disk stub), the one-time-code store, a console OTP sender, a courier stub
and a session provider — each behind a port, each declaring `isStub` so
`assertProductionSafe` refuses to boot production holding one. Paymob is P4.4.1 and Bosta is
P4.5.1; both are BLOCKED pending contracts. Giving them their own package later is a
packaging decision, not an architectural one.

---

## 3. Data and backend

| Need | Choice | Notes |
|---|---|---|
| Database | PostgreSQL via Supabase (Frankfurt) | Closest sane region to Egypt |
| Schema + migrations | **Drizzle** | Typed SQL, migrations in git. Not an ORM — nothing hidden. |
| Seller data isolation | **Postgres RLS** | Enforced by the database, not app code |
| Auth | **This application's own phone-OTP identity — NOT Supabase Auth** (ADR-05) | One-time-code digests in Postgres verified by a locked `SECURITY DEFINER` function (migration 0025); HMAC-signed cookies, one audience per console; RLS-integrated through `app.actor_id`. Customers stay guests; an OTP-verified phone at checkout is configurable (ADR-08, P1.4.1). Still missing: a real SMS sender (DEBT #1, P1.1.1) and a `sessions` table for revocation (P3.4.2) |
| File storage | **Cloudflare R2** *(amended 15 Sep 2026, founder decision M-1; was Supabase Storage)* | Product images and content images in a public-read bucket behind a Cloudflare custom domain; KYC documents in a SEPARATE private bucket, reachable only through short-lived signed links. See the note below the table |
| Realtime | Supabase Realtime | **PLANNED, not built** — the seller queue is request-response today |
| Background jobs | `pg_boss` + `pg_cron` | **PLANNED, not built.** There is no scheduler, no queue and no worker. The analytics purge is written and called by nothing (DEBT #5); reserve release never runs. Outbox, ledger and runner are P1.1.2 |
| Internal API | tRPC | End-to-end types from database to mobile screen |
| Webhook API | REST route handlers + Zod | Paymob, Bosta, WhatsApp |

**Why R2 rather than Supabase Storage (M-1).** A perfume marketplace is image-heavy and
read-mostly: every product page, grid and house page is mostly photographs, served many
times each. R2 charges nothing for egress, where Supabase Storage (and S3 behind CloudFront)
bill every gigabyte served — the one cost that grows with success. R2 speaks the S3 API, so
uploads are ordinary presigned PUTs and the adapter is replaceable. It sits behind the
Cloudflare network the DNS already uses, which has an edge location in Cairo. Supabase
Storage's main advantage — policies tied to Supabase Auth — does not apply here: sessions are
this application's own signed cookies, not Supabase Auth (ADR-05 — that was always true in
the code, and this document said otherwise until 20 September 2026).

**The one dependency it adds: `aws4fetch`** (15 Sep 2026). *What it does:* signs S3-API
requests and presigned URLs with AWS Signature V4, which R2 requires. *What it replaces:*
writing that signing by hand — cryptographic canonicalisation is exactly the code that
passes every test and then fails on one header in production. *Size:* ~65 KB unpacked,
zero dependencies, runs on Node and the edge. *Maintenance:* MIT, last release 2024 against
a signing specification that has not changed in a decade; used in Cloudflare's own R2
examples. *Rejected alternative:* `@aws-sdk/client-s3` + `s3-request-presigner` — correct,
but megabytes of dependency tree for four operations. *Cost of removal:* one adapter file
(`packages/api/src/providers/r2-media.ts`); nothing else imports it.

**What it does not decide.** Resizing. Originals live in R2; whether variants come from
Next.js image optimisation or Cloudflare image transformations is a deployment decision,
made against real traffic, behind the same `MediaStore` port.

---

## 4. Client architecture

| Concern | Web (BUILT) | Mobile (PLANNED — GATE 8) |
|---|---|---|
| Framework | Next.js, server components by default | Expo / React Native |
| Styling | Tailwind, driven entirely by `tokens.json` | NativeWind — same token classes |
| Server state | RSC + tRPC | TanStack Query via tRPC |
| Client state | Minimal; URL and server state preferred | **Redux Toolkit** (`core/store/`) |
| Component library | None — bespoke primitives in `packages/ui` | Same |

**The mobile column is a specification, not a description.** NativeWind, Redux Toolkit and
TanStack Query are in no `package.json` in this repository and will not be until GATE 8
opens. They are kept because when the apps are built, they are built that way.

**Hard rule, for that day:** server data lives in TanStack Query, client state lives in
Redux Toolkit, and they never overlap. See `ARCHITECTURE.md` §3.2.

Fonts (visual identity v2, FD-1, 14 Oct 2026; amended 16 Oct 2026 — one set for both themes, which differ in colour only): Noto Naskh Arabic headings, IBM Plex Sans Arabic text, Newsreader English headings, IBM Plex Mono Latin labels. All through `next/font`; the mapping lives once, in `apps/web/src/app/globals.css`. See CLAUDE.md §15.

---

## 5. Third-party integrations

**None of these is connected.** Every row is a chosen vendor with no account, no contract
and no adapter; the product runs COD-only, with courier and remittance recorded by hand.

| Purpose | Vendor | State |
|---|---|---|
| Payments (card, wallet, kiosk) | Paymob | PLANNED — P4.4.1, BLOCKED on counsel L14 and D-5 |
| Shipping | Bosta — behind a `CourierPort` adapter | PLANNED — P4.5.1, BLOCKED on a contract. The port and a stub exist |
| SMS / OTP | Egyptian aggregator (SMSMisr / Victory Link), Twilio fallback | PLANNED — P1.1.1, BLOCKED on ADR-11. **This is the one that blocks sign-in going live** (DEBT #1) |
| WhatsApp | Meta WhatsApp Cloud API | PLANNED — no task before P5 |
| Email | Resend | PLANNED — P1.1.3 |
| Push notifications | Expo Push → APNs / FCM | PLANNED — GATE 8 (P8.1.3) |
| Tax invoices | ETA e-invoicing | PLANNED — P6.1.5, BLOCKED on the accountant (L15) |

---

## 6. Development and operations

| Purpose | Choice | State |
|---|---|---|
| Repo | pnpm workspaces + Turborepo | **BUILT** |
| Web hosting | Vercel | PLANNED — P1.4.4. Nothing is deployed anywhere |
| Mobile builds + OTA | Expo EAS | PLANNED — GATE 8 (P8.3.1) |
| Source control + CI | GitHub + GitHub Actions | **BUILT** — private repo since 20 Sep 2026 (P0.1.2). Branch protection needs a paid plan (DR-14); the `guard` job is red (DR-13) |
| Error monitoring | Sentry | PLANNED — P1.4.3. There is no observability at all today (DEBT #22 class) |
| Founder BI | Metabase | PLANNED — `/ops/insights` covers gate 8 without it |
| DNS | Cloudflare | PLANNED — no domain registered (D-1, P0.3.2) |
| Unit tests | Vitest — mandatory on `domain` | **BUILT** — 1,538 passing |
| Web E2E | Playwright, driven by `apps/web/scripts/e2e.mjs` | **BUILT** — run by hand, **not in CI** (DEBT, P3.4.3) |
| Mobile E2E | Maestro (post-MVP) | PLANNED — GATE 8 |

`apps/web` has **no unit test runner** — only `typecheck`, `e2e` and `audit` — so every
composition root in the application rests on the compiler alone. Noted in the P0.1.3 log as
a gap without an owner.

---

## 7. Deliberately excluded

- No component kit (shadcn, MUI, Chakra) — the design is bespoke
- No search service (Algolia, Meilisearch) — Postgres FTS + Arabic normalisation at MVP
- No separate backend framework (NestJS, Express) — Next.js + tRPC is the backend
- No Redis — Postgres handles queues and caching at this scale
- No Docker or Kubernetes — managed hosting
- No GraphQL, no microservices

Each is addable later if evidence demands it. None is needed now.

---

## 8. Cost

| Stage | Monthly |
|---|---|
| Now → first live order | ~$70–100 |
| Live with real volume | ~$200–300 + per-message SMS/WhatsApp |
| One-off | Apple $99/yr · Google $25 once |

Supabase Pro from day one (daily backups; the free tier pauses). Point-in-time recovery
added once real orders exist.

---

## 9. Reversible choices

Recorded honestly so a later change is a decision, not a surprise.

| Choice | Fallback | Cost to reverse |
|---|---|---|
| **NativeWind** | Generated React Native theme object from the same tokens | Low — same design, more code |
| ~~**Payload CMS**~~ **→ taken: content tables in the platform console** (4 Sep 2026, §11) | Payload, if the content model outgrows what we build | Low while the model stays small — the block schema is ours either way |
| **SMS aggregator** | Swap providers | Low by design — OTP is built provider-agnostic. Least certain item in the stack; Egyptian deliverability is hard to predict. |

---

## 10. Known platform gotchas

- **React Native RTL** requires `I18nManager.forceRTL` and an app restart to take effect.
  Set at first launch and tested explicitly — a well-known source of bugs.
- **Apple organization enrolment** needs a D-U-N-S number, which needs the legal entity
  (D-10). 2–6 weeks. Blocks app submission.
- **Physical goods take no Apple/Google commission** — the marketplace fee is unaffected.
- **In-app account deletion is mandatory** (Apple guideline 5.1.1(v)).
- **Marketplace app review** asks about UGC moderation and seller verification. Designed
  in, not bolted on.

---

## 11. The CMS: why not Payload, after all

Recorded 4 September 2026, when the CMS came up the roadmap. §9 listed Payload
as the choice with "build content tables in the admin app" as the documented
fallback. **We are taking the fallback**, deliberately, and this is the
reasoning so a later reversal is a decision rather than a rediscovery.

Payload's value is an editing UI you do not have to build. Everything else it
brings, this repository already has: a schema and migration system (Drizzle), a
security model (RLS keyed on `app.actor_role`), staff identity and roles
(`platform_staff`), an audit trail, and a design system.

Against that, four costs specific to THIS product:

1. **Language and direction.** Payload's admin is English-first and LTR-first.
   Ours is an Arabic-first, RTL-native product where the interface is the
   proposition. Re-skinning someone else's admin to that standard is a fight
   with a framework, repeated at every upgrade.

2. **Two security models in one database.** Every read in this system passes
   through RLS bound to a GUC set per request. Payload connects with its own
   pool as the owning role. Content is platform-owned so the exposure is
   modest — but "modest" is how a second security model always starts, and the
   moment content references a seller it stops being modest.

3. **Two migration systems in one Postgres.** Payload owns its tables and
   evolves them on its own schedule. Drizzle owns ours. Nothing goes wrong
   until a deploy orders them wrongly, and then it goes wrong in the one place
   nobody wants surprises.

4. **The block schema is ours either way.** A luxury brand does not hand an
   editor a rich-text box: arbitrary HTML is both an injection surface and a
   design surface, and the second is the one that actually breaks. Whichever
   CMS we run, the content model is a closed set of blocks that the design
   system renders. That is the hard part, and Payload does not do it for us.

What we forgo: media library, scheduled publishing, and preview — all of which
we would eventually build anyway, and two of which are one afternoon each.

**The reversal condition, stated in advance.** If the content model grows
beyond roughly a dozen block types, or non-technical editors need to create
NEW page templates rather than fill in existing ones, the editing UI stops
being an afternoon and Payload becomes the cheaper answer. The block schema
transfers; the console screens do not.

---

## Le Dévoilement — what the reveal uses, and does not (19 Oct 2026)

No new dependency. The relief is made by `makeRelief` in `packages/domain` — plain arithmetic
on typed arrays (scanline polygons, box-blur Gaussians, the exact distance transform, a
multi-scale normalised convolution for the backdrop, bilinear rotation) — run in a Web Worker
in the console. The browser decodes and encodes the images (canvas); nothing does on the
server. The storefront draws the bottle with ~300 lines of plain WebGL 1
(`features/product/reveal/bottle-gl.ts`): Three.js would add ~150 kB for a single mesh and a
single shader, and is not needed. No machine-learning model: the founder chose automatic
cut-out for plain backgrounds and hand tracing otherwise (DECISION_REGISTER, 19 Oct 2026).

**One storage setting to remember when R2 is configured:** the console reads a photograph's
pixels to make its relief, so the R2 bucket's public origin must answer GET with
`Access-Control-Allow-Origin` for the site's own origin. Without it the console's tool reports
that the photograph could not be loaded; the shop itself is unaffected (it shows photographs
as images, which needs no CORS, and draws reliefs as textures, which does).

