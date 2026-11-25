# Local website completion — 25 November 2026

Status: review snapshot on codex/diyar-storefront-customer-seller-20261125. The founder approved publishing this separate feature branch on 25 November 2026; no deployment or main merge is authorized. The founder explicitly approved adding the missing customer backend during this task. Existing storefront, scent map, 3D, bag, seller and financial work is preserved.

## Connected functionality

- /sign-in: Egyptian phone OTP, using the existing durable one-time-code store with a new customer audience. No seller/operator code is accepted for customer sign-in. Email is contact data only; email sign-in is not implemented.
- /account: required full name, date of birth and controlled gender; optional structured fragrance families, user-entered notes, occasions, seasons, concentrations, bottle sizes and integer-piastre budget. Never stores age.
- /account?tab=addresses: persisted addresses, removal and a serialized default-address selection. Checkout prefills the default/latest address and permits delivery-address corrections. Editing a saved address currently means removing/replacing it.
- /account?tab=orders: latest 100 owned orders, with tracking, reviews and returns through the existing order-detail components. Phone snapshots for historical orders are preserved and are not placed in links.
- /account?tab=privacy: manual export/deletion requests through the existing support form; sign out and revoke all customer sessions. Requesting is not automated export or deletion.
- /checkout: verified customer and complete profile required on the server; verified phone is used for the order. Duplicate-checkout protection, server pricing, reservations and financial calculations remain in use. Confirmation cache is scoped by customer.
- /seller/storefront: actual own-house status, public storefront and catalogue management links. Identity/team changes use support; no fake self-service save, invitation or publishing.
- Tracking/support/returns distinguish connection failures from empty/not-found results and release busy state after failures. Return submission is explicitly distinct from approval/refund; displayed refund facts are called recorded amounts.

## Architectural boundaries / evidence

Domain port: packages/domain/src/ports/customer-account.ts. RLS-scoped adapter: packages/db/src/customer-account-repository.ts. API validation: packages/api/src/routers/customer-account.ts. Server actions and revocable session: apps/web/src/features/customer/. Existing identity adapter gains phone claiming and customer session resolution.

Customer sessions use a separate cookie, secret and audience, and the existing database revocation mechanism. CUSTOMER_SESSION_SECRET must be configured for production. The web composition root always enables required customer checkout; the API defaults to requiring it. Only explicitly legacy test/manual contexts may opt out. The public HTTP transport remains anonymous and therefore cannot bypass checkout sign-in; the website uses authenticated server actions.

Phone normalization resolves legacy 01 / +201 spelling without replacing customer IDs. If both spellings already exist as separate customer rows, sign-in refuses for manual review instead of merging financial history. A claimed account's name is not rewritten by a gift recipient's checkout name. Existing financial address/contact snapshots are unchanged.

## Data dictionary and governance

customer_profiles.customer_id: one-to-one FK to the existing customer; no fabricated backfill.

date_of_birth: ISO calendar date, 1900 through current date, required for a completed profile. gender: female / male / other; required, no inferred value.

families / occasions / seasons / concentrations: arrays of controlled vocabulary keys declared in the domain port. notes: bounded array of self-reported text, not a normalized catalogue taxonomy or inferred behavioral fact. bottle_sizes: bounded positive ml integers. budget_min_piastres / budget_max_piastres: nullable integer EGP minor units; null means unspecified, and min cannot exceed max.

personalization_consent / marketing_consent: false by default; the latter is SMS only, to the verified phone. Consent choices do not enable sending or ML. Each save also appends explicit true/false facts to the existing consent_records ledger for personalization and marketing_sms, source customer_account:v1. Email/WhatsApp consent is not inferred. Existing anonymous analytics are not linked to this profile by this work.

collected_at / updated_at / source: first collection, most recent profile save and customer_account origin. customer_profile_history records timestamped profile snapshots on every insert/update; sellers cannot read them. Customer name/email remain on customers, separately from transactional snapshots. DOB/gender are not added to seller customer rankings.

Retention periods, history purging, verified deletion/export fulfilment and consent notice approval need founder/operational ownership before production. No automated deletion of historic orders or money records is introduced.

## Migration safety

0047_customer_accounts.sql is additive: customer session/OTP audience, unique non-null auth-user identity, guarded identity changes, profiles/history, indexes and role-isolated customer lookup. Existing customer/order rows receive no invented values. 0048_customer_preference_consent.sql adds personalization to the existing consent-purpose enum. Do not rewrite earlier migrations.

The branch still has a different migration lineage from partner/main (see LOCAL_PREVIEW.md). These migrations must not be executed blindly on a partner/main database. No production or staging migration has been run.

A stopped copy of the isolated demo database was preserved at D:/DIYAR-local/tmp/customer-account-demo-before-1795630345 before 0047. Synthetic account/address data used for browser checks is confined to the existing isolated demo. No browser order or money movement was submitted.

## External / release requirements

Real SMS sending, email authentication/delivery, notification operations, provider refunds, real brand content/assets and commercial/legal approval are not supplied by this work. Production startup still refuses stub providers. No auth bypass or unverified email login was introduced. No full build, native PostgreSQL multi-connection concurrency certification, deployment or main merge was performed.

## Verification completed

21 distinct focused checks passed: customer identity/RLS/session/address/profile/consent tests, migration safety, customer checkout authorization and existing replay protection, and EGP/bottle-size form parsing. Web, API and database TypeScript passed. Git whitespace check passed.

Browser verified phone login and required onboarding; saved profile/preferences/address persistence; verified-phone/saved-address checkout prefill; Arabic RTL and dark mode; sign-out-everywhere; real privacy-support category/contact prefill; preserved product bag drawer and seller storefront; simulated tracking network failure with retry enabled. No observed page errors in the final integration pass. No browser order, refund, payout or delivery mutation was submitted. Screenshots are local under D:/DIYAR-local/tmp/customer-*-20261125.png.

Order details also link to the real support form with the order reference for help/cancellation requests. This is manual review, explicitly not automatic order cancellation. Support requests still require submitting the form.
