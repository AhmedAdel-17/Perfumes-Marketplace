# Frontend architecture

## 1. Current (FACT)

- Next.js 15 App Router, RSC by default, server actions as the mutation path, an in-process
  tRPC caller as the data path; no client query library; cart in localStorage via a React
  context; URL state for search; forms in `useState`.
- Design tokens → Tailwind roles; theme via `data-theme` set before hydration.
- Shared UI is scattered: `features/shell` (button, reveal, grain, pills),
  `features/checkout/Field.tsx`, `packages/ui` (icons). No primitives package.
- No `loading.tsx` / `error.tsx`; no skeletons; no `Suspense` boundaries.
- Public reads bypass the API (`core/catalogue.ts`), so the pages are coupled to Drizzle.
- Quality tooling is unusually good: Playwright journeys, axe + RTL + 44 pt audit at six
  widths and two themes, static guards for hex colours, physical-direction classes and the
  `'use client'` prologue.

## 2. Target

### 2.1 Layers

```
apps/web/src/
├── app/                      routes: composition only; loading.tsx + error.tsx per group
│   ├── (maison)/             / search p house houses cart checkout order support apply [slug]
│   ├── (seller)/seller/      dashboard orders listings returns payouts staff profile
│   ├── (ops)/ops/            queue orders moderation reviews returns support houses content site audit insights exceptions
│   └── api/                  trpc · webhooks · jobs
├── core/                     api.ts db.ts media.ts login-codes.ts analytics.ts (composition roots only)
├── design-system/            re-exports @diyar/ui primitives + web-only motion helpers
└── features/                 one folder per journey step or tool; server + client components + actions
packages/ui/src/primitives/   the primitives in 02-design-system.md
```

### 2.2 Data

- **Reads**: server components call `api(actor).namespace.query()` — never Drizzle. The
  catalogue module moves into `catalogue.*` procedures (ADR-10).
- **Caching**: product and house pages switch from `force-dynamic` to **ISR with tag
  revalidation** (`revalidateTag('product:{id}')` on listing publish/price/stock change);
  home and search stay dynamic with a short `s-maxage`. Consoles and portal are dynamic.
- **Mutations**: server actions remain the transport for the web (same-origin, typed,
  progressive enhancement). Each action returns `{ ok, data } | { ok: false, message,
  field?, requestId }`; a shared `useAction()` hook handles pending, error and optimistic
  state so islands stop hand-rolling `submitting`/`result`.
- **Client state**: cart stays in localStorage behind the context (identity + quantity
  only); compare tray and recently viewed join it (same shape); filters stay in the URL.
  No global store on the web.
- **Realtime**: seller queue polls `seller.queue` every 30 s while visible (`visibilitychange`),
  which is enough until Supabase Realtime is justified.

### 2.3 Rendering and performance

- Budget: LCP < 2.5 s on a throttled 3G profile for product and search; JS ≤ 120 KB shared;
  fonts three files (kept); images via `next/image` from R2 with per-surface `sizes`;
  blur-up placeholders generated at upload (store a 16 px base64 on `product_media`).
- Skeletons match final layout; `Reveal` only above the fold, once per route.
- `@next/bundle-analyzer` in CI on PR with a size-diff comment.

### 2.4 Forms

- One `Form` pattern: Zod schema shared with the router (import the same schema from
  `@diyar/api` where it exists), client pre-validation with the same Arabic messages,
  server as the authority. Phone/number digit normalisation stays in `Field`.
- Multi-step where the journey needs it (checkout on phone: contact → address → review),
  state in the URL hash so a refresh does not lose progress.

### 2.5 Authentication state

- Server-side session read in the layout of each route group; a small `SessionBadge`
  client component receives only what it renders (name, role). No auth context, no token in
  the browser.

### 2.6 Analytics

- `Track` stays; add `compare_view`, `wishlist_add` when built; `campaign_click` and
  `source_attributed` come from the attribution middleware (ADR-07) — the same first-party
  cookie, no third-party script.

### 2.7 Internationalisation

- All copy in `@diyar/i18n` (move the label maps out of `core/catalogue.ts`). Direction and
  locale from the layout; the second locale (D-3) is a dictionary and a `dir` switch.

### 2.8 Testing and quality gates

- Keep `audit.mjs` and the Playwright journeys; run both in CI against a built app on
  PGlite (10-infrastructure §3).
- Add visual regression: `shots.mjs` already captures surfaces; store baselines per theme
  and width, diff on PR with a threshold; a design change updates baselines deliberately.
- Add a `packages/ui` dependency rule test: primitives import nothing from `features/`.
- Component states enumerated in a story-like page under `/design-system` (dev only) so
  every primitive's five states can be audited on one screen.

## 3. Migration path (no big bang)

1. Create `packages/ui/src/primitives` by **moving** `PrimaryButton`, `Field`, `statusPill`,
   `Reveal`, `Grain`, `Monogram` and giving each its missing states. Replace imports.
2. Add `loading.tsx`/`error.tsx` per route group with skeletons for grid, product, queue,
   table.
3. Move catalogue reads to procedures; delete `core/catalogue.ts`.
4. Introduce the Atelier tokens and re-skin the seller queue as the first tool surface;
   measure the scroll height and time-to-confirm before and after.
5. Then the journey redesign in the order of `04-redesign-plan.md`.
