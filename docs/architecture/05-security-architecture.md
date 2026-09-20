# 05 — Security architecture

Current state (FACT) first, target (REC) second, in the order the founding pack lists the
non-functional requirements: strong auth for admins/sellers, least privilege, secure secrets,
audit logs, vulnerability management (doc 04 §5).

---

## 1. Authentication

### Current (FACT)

| Principal | Mechanism | Strengths | Weaknesses |
|---|---|---|---|
| Customer | none; phone typed at checkout; tracking by reference + phone | no password surface | phone unverified (H5); review forgery (M16) |
| House owner | phone → 6-digit code (crypto random) → HMAC-SHA256 cookie `diyar_seller`, 12 h, `sameSite=lax` | digest-only storage, 5 attempts in a locked SQL statement, 5-min TTL, same answer for unknown numbers, 5 codes/h/phone, revocation on every request | SMS sender is a stub (H4); staff cannot sign in (H11); no server-side session list (M15) |
| Operator/admin | same shape, cookie `diyar_ops`, 4 h, `sameSite=strict`, separate secret | shorter window for money movers | same as above |
| Native app | none (bearer planned) | — | — |

### Target (REC)

- Real `OtpSender` (Egyptian aggregator, Twilio fallback). Codes never logged.
- `sessions` table: id, principal, audience, issued, expires, revoked_at, ip hash, UA hash.
  Cookie carries session id + HMAC; revocation is a row update; "sign out everywhere" is one
  query. Same table backs bearer tokens for apps later (refresh = new row).
- Staff sign-in resolves `seller_staff.phone` (+ owner phone), role loaded into the context.
- Customer: OTP-verified phone at checkout per `checkout_policy` (ADR-08); verified phone
  stored on the customer with `verified_at`; reviews and returns require a verified phone or
  a fresh OTP.
- Admin sign-in additionally requires the phone to be on an allow-list of admin numbers
  and, when a second factor is cheap (TOTP), it is added for the `admin` role only.

## 2. Authorisation (RBAC)

### Current (FACT)

Three layers: tRPC procedure builders (`public`, `seller`, `platform`); RLS policies keyed on
`app.actor_role()` / `app.actor_id()` / `app.staff_seller_id()` / `app.is_seller_owner()`;
DB triggers for state. Service roles (`checkout`, `aftercare`, `intake`, `analytics`,
`identity`) exist only inside one transaction and are restricted by `WITH CHECK`. Proven by
`rls.test.ts`, `policy-shape.test.ts` (every table must have a policy or a proof block).

Gaps: seller staff roles not enforced beyond payouts; `platform_staff.role` free text with
two ad-hoc checks (`admin` for insights and publishing).

### Target (REC) — permission matrix

| Capability | Customer (verified) | House owner | House admin | House manager | House operations | House support | Operator | Admin |
|---|---|---|---|---|---|---|---|---|
| Place / track / cancel own order, review, return | ✓ | — | — | — | — | — | on behalf | on behalf |
| Confirm / decline / dispatch | — | ✓ | ✓ | ✓ | ✓ | view | — | override |
| Returns: agree / mark received | — | ✓ | ✓ | ✓ | ✓ | view | ✓ | ✓ |
| Listings: create / edit / submit / photos | — | ✓ | ✓ | ✓ | — | — | moderate | moderate |
| Price & stock on live listing | — | ✓ | ✓ | ✓ | stock only | — | — | — |
| Payouts, statements, ledger (own house) | — | ✓ | ✓ | ✓ | — | — | — | all houses |
| House profile, staff | — | ✓ | ✓ (not owner) | — | — | — | — | status changes |
| Mark delivered / refused, remittance | — | — | — | — | — | — | ✓ | ✓ |
| Run / approve / pay payout | — | — | — | — | — | — | draft | approve (2nd person), pay |
| Commission rules, fee terms, policies | — | — | — | — | — | — | — | ✓ (two approvers) |
| Refunds | — | — | — | — | — | — | propose | approve |
| CMS publish, announcements | — | — | — | — | — | — | draft | publish |
| Audit log, insights | — | — | — | — | — | — | audit | both |

Implementation: `staff_role` enum migrated to S-1 names; `app.staff_role()` drives RLS
(`money` tables: owner/admin/manager; `products` write: owner/admin/manager; `sub_orders`
write: all but support); `platform_role` enum `operator|admin`; procedure builders
`sellerProcedure(permission)` and `platformProcedure(permission)` read a single
`PERMISSIONS` map in `domain/sellers/permissions.ts` (tested).

## 3. Least privilege in the database (FACT, keep)

Every request runs as `app_user` under `SET LOCAL ROLE`; the pool owner's privileges are
never used inside a transaction. Add a `jobs` actor role with only the writes each job
needs (ledger posting, outbox dispatch, purge), and a `webhook` role for inbound events.

## 4. Sensitive actions

| Action | Control (target) |
|---|---|
| Payout approval | second admin; audit; amount and house in the entry; notification to owner |
| Commission / fee change | two approvers; effective-from date; audit; snapshot unaffected |
| Refund | admin approval above a threshold (policy value); audit; ledger + payment reversal |
| Seller suspension | reason code; audit; effect on open sub-orders stated (policy) |
| Staff permission change | audit (`staff_permission_change` exists in the enum, unused) |
| Privacy request | audit; two-person for deletion |
| Rule: every one of these is a use-case that takes `AuditTrail` as a port and writes in the same transaction — the Decorator pattern from the registry, applied through an `audited()` procedure builder. |

## 5. Secrets

Current: env variables, start-up guard refuses production without them, dev fallbacks are
literal strings. Target: Vercel encrypted env per environment, Supabase vault for DB
secrets, R2 token scoped to one bucket, PSP/courier keys never in the browser, quarterly
rotation runbook, `SELLER_SESSION_SECRET`/`OPS_SESSION_SECRET` rotation with dual-key
verification window.

## 6. Data protection (PDPL 151/2020)

- Minimal collection is already practised (no email required, no search text stored).
- Add: `consent_records` written at checkout (purpose `order_fulfilment`) and at any
  marketing opt-in; privacy request workflow (`privacy_requests` → verify by OTP → export
  bundle or pseudonymise); retention table (orders: statutory period per counsel; analytics
  180 d; login codes 5 min; sessions 30 d).
- KYC documents (verification evidence) go to a **private** R2 bucket with short-lived
  signed reads, never the public media bucket.
- Phone numbers are hashed in analytics and logs; full numbers only in order rows and
  notifications.

## 7. Audit logging

Exists and is strong. Add request id, ledger and payout events, staff permission changes,
suspension effects, privacy handling. Keep append-only trigger. Retain indefinitely.

## 8. Rate limiting and abuse

Current: in-process fixed windows on 7 public write paths. Target: `rate_limit_windows`
table (same `consume()` interface, DEBT #2) + Cloudflare per-IP rules at the edge; OTP
limits per phone **and** per IP; checkout limits per phone and per address hash; upload
limits per house; refusal-history flags reviewed by a person (no automated blocklist, doc
06 §7).

## 9. Application security controls

- Security headers in `next.config` (CSP with nonce for the theme script, HSTS,
  `frame-ancestors 'none'`, `referrer-policy`).
- CSRF: server actions are same-origin by Next's design; the tRPC HTTP route never sends
  `Allow-Credentials` (kept). Webhooks verify HMAC and are idempotent.
- Uploads: presigned PUT, server verifies bytes (type, size, dimensions) — kept; add
  content sniffing for SVG (reject) and EXIF stripping via the image pipeline.
- Dependency advisories in CI weekly; Renovate or Dependabot for lockfile PRs.
- Admin console on its own hostname later (`ops.diyar.eg`) with Cloudflare Access in
  front — cheap defence for the screen that releases money.
