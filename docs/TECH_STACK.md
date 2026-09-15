# Technology Stack

Confirmed 1 September 2026. Exact versions pinned at project setup.

**One line:** TypeScript everywhere · Next.js for all web · Expo for both mobile apps ·
PostgreSQL on Supabase · one shared package holding all money logic.

---

## 1. Applications

| Surface | Built with | Hosted on |
|---|---|---|
| Marketplace website | Next.js (App Router) + React + TypeScript + Tailwind | Vercel |
| Brand storefronts | Same app, own routes and metadata | Vercel |
| Seller portal | Next.js — separate app, same repo | Vercel |
| Admin + CMS | Next.js — content tables in the platform console (§11) | Vercel |
| Buyer mobile app | Expo (React Native) — iOS + Android | App Store / Play |
| Seller mobile app | Expo (React Native) — iOS + Android | App Store / Play |

Two separate store listings, not one binary. They share packages, not an app.

---

## 2. Shared packages

| Package | Contents |
|---|---|
| `domain` ⭐ | Order state machine, attribution, commission, money. Pure TypeScript, zero framework imports. |
| `db` | Drizzle schema, migrations, RLS policies, repository implementations |
| `api` | tRPC routers — thin facades over domain services |
| `integrations` | Paymob, Bosta, SMS, WhatsApp, email adapters |
| `tokens` | `tokens.json` → Tailwind preset + React Native theme |
| `ui` | Shared primitives, web and native variants |
| `i18n` | Copy layer — Arabic now, second locale switchable |

---

## 3. Data and backend

| Need | Choice | Notes |
|---|---|---|
| Database | PostgreSQL via Supabase (Frankfurt) | Closest sane region to Egypt |
| Schema + migrations | **Drizzle** | Typed SQL, migrations in git. Not an ORM — nothing hidden. |
| Seller data isolation | **Postgres RLS** | Enforced by the database, not app code |
| Auth | Supabase Auth, phone-OTP primary | Phone is the primary customer identifier |
| File storage | **Cloudflare R2** *(amended 15 Sep 2026, founder decision M-1; was Supabase Storage)* | Product images and content images in a public-read bucket behind a Cloudflare custom domain; KYC documents in a SEPARATE private bucket, reachable only through short-lived signed links. See the note below the table |
| Realtime | Supabase Realtime | Live seller order queue |
| Background jobs | `pg_boss` + `pg_cron` | SLA clocks, courier polling, payout runs. In-database; no extra vendor. |
| Internal API | tRPC | End-to-end types from database to mobile screen |
| Webhook API | REST route handlers + Zod | Paymob, Bosta, WhatsApp |

**Why R2 rather than Supabase Storage (M-1).** A perfume marketplace is image-heavy and
read-mostly: every product page, grid and house page is mostly photographs, served many
times each. R2 charges nothing for egress, where Supabase Storage (and S3 behind CloudFront)
bill every gigabyte served — the one cost that grows with success. R2 speaks the S3 API, so
uploads are ordinary presigned PUTs and the adapter is replaceable. It sits behind the
Cloudflare network the DNS already uses, which has an edge location in Cairo. Supabase
Storage's main advantage — policies tied to Supabase Auth — does not apply here: sessions are
this application's own signed cookies, not Supabase Auth.

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

| Concern | Web | Mobile |
|---|---|---|
| Framework | Next.js, server components by default | Expo / React Native |
| Styling | Tailwind, driven entirely by `tokens.json` | NativeWind — same token classes |
| Server state | RSC + tRPC | TanStack Query via tRPC |
| Client state | Minimal; URL and server state preferred | **Redux Toolkit** (`core/store/`) |
| Component library | None — bespoke primitives in `packages/ui` | Same |

**Hard rule:** server data lives in TanStack Query, client state lives in Redux Toolkit,
and they never overlap. See `ARCHITECTURE.md` §3.2.

Fonts: Amiri (Arabic headings) · Bodoni Moda (Latin labels) · IBM Plex Sans Arabic (body).

---

## 5. Third-party integrations

| Purpose | Vendor |
|---|---|
| Payments (card, wallet, kiosk) | Paymob |
| Shipping | Bosta — behind a `CourierPort` adapter |
| SMS / OTP | Egyptian aggregator (SMSMisr / Victory Link), Twilio fallback |
| WhatsApp | Meta WhatsApp Cloud API |
| Email | Resend |
| Push notifications | Expo Push → APNs / FCM |
| Tax invoices | ETA e-invoicing |

---

## 6. Development and operations

| Purpose | Choice |
|---|---|
| Repo | pnpm workspaces + Turborepo |
| Web hosting | Vercel |
| Mobile builds + OTA | Expo EAS |
| Source control + CI | GitHub + GitHub Actions |
| Error monitoring | Sentry |
| Founder BI | Metabase |
| DNS | Cloudflare |
| Unit tests | Vitest — mandatory on `domain` |
| Web E2E | Playwright — checkout, seller confirm, payout |
| Mobile E2E | Maestro (post-MVP) |

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
