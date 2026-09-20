# 10 — Infrastructure and deployment

Current state: a laptop, an embedded database, a CI file that watches a branch that does not
exist on a remote that is not configured. Target: the smallest managed setup that gives
staging, backups, secrets and rollback.

## 1. Environments

| Env | Purpose | Database | Media | Providers |
|---|---|---|---|---|
| `local` | development | PGlite embedded (kept) or `DATABASE_URL` to a personal Supabase branch | local disk | console OTP, COD, manual courier |
| `preview` | every PR (Vercel preview) | Supabase **branch** per PR or a shared `preview` project with seed | R2 `diyar-preview` | stubs allowed; `NODE_ENV≠production` |
| `staging` | pilot rehearsal, founder review | Supabase `staging` project, Frankfurt, seeded + anonymised copy later | R2 `diyar-staging` | **real** SMS to allow-listed numbers, Paymob sandbox, Bosta sandbox |
| `production` | pilot and beyond | Supabase Pro `prod`, Frankfurt, PITR on | R2 `diyar-media` behind `media.diyar.eg` | real |

## 2. Hosting

- **Vercel** for the Next app (Frankfurt region `fra1` functions; static assets on the edge;
  Cairo is served from Cloudflare's edge in front).
- **Cloudflare** DNS, WAF, per-IP rate limits, R2, and Access in front of `/ops` when the
  console gets its own hostname.
- **Supabase** Postgres (transaction pooler on 6543 for the app, as `.env.example` says;
  direct connection only for migrations).
- No Docker, no Kubernetes, no worker host (ADR-04) until a job needs one.

## 3. CI/CD (GitHub Actions)

1. **Fix first:** create the GitHub remote; rename `master` → `main` or change the workflow
   trigger. Protect `main`: PR required, CI green, one review.
2. Pipeline on PR: install (frozen lockfile) → typecheck → unit/contract/RLS tests (PGlite)
   → build → **browser suite against the built app with PGlite** (currently manual) →
   accessibility audit both themes → grep guards → `pnpm audit:deps` (weekly schedule, not
   per PR).
3. On merge to `main`: Vercel builds; a **migration step** runs `applyMigrations` against
   staging (GitHub Action with the direct connection secret) **before** the deploy is
   promoted; smoke test (`/`, `/p/{seed}`, `/api/trpc/catalogue.directory`); promote.
4. Production deploy is a manual promotion of a staging-verified build (Vercel "promote to
   production"), migrations applied first, in a window announced to operations.

## 4. Jobs (ADR-04)

- `/api/jobs/{name}` route handlers, `Authorization: Bearer $JOBS_SECRET`, `runtime =
  'nodejs'`, `maxDuration` set per job.
- Triggered by **Vercel Cron** (`vercel.json` schedules) — simplest, in the same deploy.
  Alternative is Supabase `pg_cron` + `pg_net` calling the same URLs; choose one.
- Each run: insert `job_runs (job, run_key)` (UNIQUE) → do work in batches → mark result.
  A job that overruns its schedule is skipped by the unique key, not run twice.
- Long work (courier polling, payout drafting for many houses) is batched per run with a
  cursor stored in `job_runs`.

## 5. Database operations

- Migrations: forward-only, expand/contract (ADR-13), applied by CI, ledger sealed (kept).
- Backups: Supabase daily (Pro) + **PITR** enabled before the first real order; monthly
  restore drill to a branch, timed and recorded (recovery objectives: RPO 5 min with PITR,
  RTO 1 h).
- Roles: app connects as a non-superuser role; `app_user` is set per transaction (kept).
- Connection budget: `DATABASE_POOL_MAX` per instance × instances < pooler limit.

## 6. Object storage

- R2 public bucket with custom domain (product/editorial images), CORS for PUT from the site
  origin only (README).
- Private bucket for verification evidence; signed GET, 5-minute expiry.
- Lifecycle rule: abandoned uploads under `uploads/` expire after 1 day (DEBT #4).
- Image variants: Next image optimiser from the R2 origin at first; Cloudflare Image
  Resizing if optimiser cost or latency shows in Vercel usage.

## 7. Secrets

Vercel encrypted env per environment; GitHub Actions secrets for the migration connection
string and R2 tokens; Supabase vault for DB-side secrets. Rotation runbook in
`docs/runbooks/` (to create): session secrets (dual-key window), R2 token, PSP key, SMS key,
`JOBS_SECRET`.

## 8. Monitoring

See `09-observability.md`. Uptime check on `/` and `/api/trpc/catalogue.directory` every
minute (Better Stack or Cloudflare health check) → technical founder.

## 9. Rollback strategy

- Application: Vercel instant rollback to the previous deployment (immutable builds).
- Schema: never rolled back; expand/contract guarantees the previous build runs on the new
  schema. If a migration must be undone, a new forward migration does it.
- Data: PITR to a branch, verify, then targeted repair scripts run as a job with an audit
  entry; never a manual `UPDATE` from a laptop (doc 06 §12 "no manual balance adjustment
  without reason, approver and audit evidence").
- Providers: every adapter has a kill switch env (`PAYMENTS_CARD_ENABLED=false` falls back
  to COD-only; `COURIER_BOSTA_ENABLED=false` falls back to manual).

## 10. Cost (ASSUMPTION, aligned with TECH_STACK §8)

Vercel Pro ~$20 · Supabase Pro ~$25 + compute · R2 ~$1 · Cloudflare free/Pro $20 · Sentry
free tier · Axiom free tier · SMS per message (~EGP 0.3–0.6) · WhatsApp per conversation.
≈ $80–120/month before message volume. Apple/Google fees only in Phase 4.

## 11. Launch-day checklist (doc 06 §14, engineering half)

- [ ] `main` on GitHub, CI green, branch protected
- [ ] staging deployed, migrations applied by CI, smoke passing
- [ ] production Supabase with PITR, restore drill done
- [ ] all required env present; start-up guard passes with **no stubs**
- [ ] Sentry receiving, log drain live, uptime check live, alert owners confirmed
- [ ] jobs scheduled and observed running once each
- [ ] SMS sending to a real number from staging; OTP for seller/ops verified
- [ ] rate limits in the database; Cloudflare rules on
- [ ] backups of R2 buckets (versioning on)
- [ ] rollback rehearsed once
