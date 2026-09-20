# Current capabilities — what a person can actually do today

Verified by reading the routers, the repositories, the migrations and the browser suite, and
by reading what the seed produces. "Works" means the path exists end to end in production
code and is exercised by at least one test. "Partial" means the path exists but a
requirement in docs 01–06 that it serves is not met. "Missing" means no production code path.

Doc references are to the founding pack (04 = Product Requirements, 06 = Operations Playbook).

## Customer (guest — there are no customer accounts)

| Capability | State | Evidence / gap |
|---|---|---|
| Browse home, houses directory, house page | works | `core/catalogue.ts`; e2e "the house is a destination" |
| Search with Arabic spelling variants, filters in URL, sort | works | `arabic-search.ts`, `/search` |
| Product page: notes pyramid, performance bands with source disclosure, delivery window, reviews | works | `p/[slug]`; `arrivalWindow` shared with checkout (QA #14) |
| Compare products | **missing** | doc 04 §2 "compare"; no `comparison_view` |
| Wishlist | **missing** | doc 04 §3 |
| Cart, multi-house grouping, per-house shipping shown before payment | works | `CartPricer`, flat 55 EGP per house |
| Checkout: name, phone, address (governorate→city→area→street), COD | works | `orders.place`; Arabic-Indic digits accepted |
| Electronic payment | **missing** | `paymentMethod: z.literal('cod')` |
| Order tracking by reference + phone | works | `orders.byReference` |
| Cancel an order | **missing** | no procedure moves a sub-order to `cancelled` |
| Status notifications (SMS/WhatsApp) | **missing** | no notifier exists |
| Verified-purchase review (six dimensions), only after delivery | works | domain + router + DB trigger |
| Return request within policy windows, seller answer, platform refund | **partial** | `returns` table moves through 7 states; **the sub-order never becomes `returned` and settlement never reverses** |
| Support ticket with/without order | works | `support.*`, operator reply visible to customer |
| Privacy export/delete request | **missing** | `privacy_requests` table unused; pending counsel |

## Seller ("house")

| Capability | State | Evidence / gap |
|---|---|---|
| Apply to join (intake form, terms first) | works | `applications.submit`, `intake` role |
| Verification checklist (8 controls), approval, go-live gate | works | `sellers_verification_gate` trigger; ops `applications.verify/setStatus` |
| Sign in (phone + code) | **works in dev only** | SMS sender is a stub; production refuses to boot with it. Only the **owner's phone** resolves; staff cannot sign in |
| Staff roles with limited permissions | **partial** | enum `owner/manager/fulfilment/viewer` ≠ decided S-1 roles; only payouts are owner-gated (RLS); no role-aware UI |
| Create/edit listing (24 fields), gap counter, prohibited-claim scanner, submit for moderation | works | `listings.*`, specifications |
| Upload verified photographs (presigned PUT, server verifies bytes), set primary, alt, ownership | works | `photos.*`, R2/local |
| Edit price and stock on a live listing | works | with product revisions |
| Order queue sorted by active deadline; confirm / decline with coded reason / dispatch with tracking number | works | `seller.*` |
| Dispatch SLA clock | works since 0020 | confirmation starts `dispatch_due_at` |
| See returns and answer them | works | `returns.mine/decide` |
| Payout list and itemised statement | works | `seller.payouts/statement` |
| Attributed-source reporting, promotion codes, storefront social link | **missing** | doc 04 §3 seller requirements |
| Bosta booking / label | **missing** | manual tracking number only |
| Notifications of a new order or a deadline | **missing** | — |

## Platform operations / admin

| Capability | State | Evidence / gap |
|---|---|---|
| Sign in (phone + code), separate cookie, 4h, revocation per request | works in dev | same SMS stub |
| Work queue: mark delivered, record COD remittance | works | `platform.workQueue/markDelivered/recordRemittance` |
| Mark refused / cancel on customer's behalf | **missing** | states unreachable |
| Run a payout for a house | **works but wrong** | pays every eligible sub-order on **every** run (see `08-order-payment-payout-flows.md`) |
| Mark a payout paid / advance status | **missing** | `payouts.status` stays `accruing` |
| Change commission rates | **missing** | `commission_rule_sets` never read; rates are a constant |
| Moderate listings (coded reasons), reviews (hide/restore with note) | works | audited |
| Applications board, house status changes | works | audited |
| Returns board, refund decision (amount, cost bearer) | works | audited; does not touch settlement |
| Support queue, reply, priority by category | works | — |
| CMS: pages of typed blocks, draft/review/publish, revisions, preview, announcements, homepage curation, editorial images | works | — |
| Audit log screen (keyset paging, in words) | works | — |
| Owner report: post- and pre-order funnel, SLA per house, refusals by governorate, source mix, contribution inputs with status | works | admin role only; margin withheld until A-2 |
| SLA breach alerts, daily exception report | **missing** | no scheduler |
| Reconcile COD remittance vs `cod_amount` | **missing** | recorded, not compared |

## Cross-cutting

| Concern | State |
|---|---|
| Row-level security, proven by tests through an unprivileged role | works |
| Audit trail written inside the deciding transaction | works for: listing moderation, review moderation, payout approval, remittance, refund, policy publishing, application decisions |
| Rate limiting on public writes | works, in-process only |
| Production start-up guard (stubs, secrets, database) | works |
| HTTP API for native clients | anonymous reads only |
| Observability | none |
| Background jobs | none |
| Notifications | none |
| Payment / courier webhooks | none (dedupe table exists, unused) |
