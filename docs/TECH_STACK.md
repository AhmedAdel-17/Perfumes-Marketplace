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
| Admin + CMS | Next.js + Payload CMS mounted inside | Vercel |
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
| File storage | Supabase Storage | Product images, KYC documents |
| Realtime | Supabase Realtime | Live seller order queue |
| Background jobs | `pg_boss` + `pg_cron` | SLA clocks, courier polling, payout runs. In-database; no extra vendor. |
| Internal API | tRPC | End-to-end types from database to mobile screen |
| Webhook API | REST route handlers + Zod | Paymob, Bosta, WhatsApp |

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
| **Payload CMS** | Build content tables in the admin app | ~3 weeks. It never owns commerce data, so removal cannot touch orders or money. |
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
