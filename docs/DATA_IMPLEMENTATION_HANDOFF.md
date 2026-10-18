# DIYAR: database/data review handoff

Date: 18 October 2026. Review branch: `codex/diyar-data-review`.
Workspace: `D:/DIYAR-local/DIYAR-implementation`.

## Scope and preservation

This is a local database/data push candidate, not completion of the marketplace or approval to launch. It contains database migrations, persistence contracts, their focused checks, the listing-brand ownership validation at the API boundary, and audit documentation. No web/UI changes, checkout transport changes, dependency version changes, environment files, generated data or deployment changes are included relative to its main baseline.

The earlier mixed implementation is preserved on `codex/diyar-db-safe-01` through `9687020`. Its browser/build results describe that older branch, not this data-only candidate. Both original C: project directories are preserved. The seven original audit artifacts remain unchanged historical evidence; this document and [current code-defined ERD](DATA_CURRENT_ERD.mmd) describe the implementation delta. The inventory/orientation files are original audit snapshots, not newly regenerated project scans.

## Implemented data changes

| Area | Implemented behavior | Repository evidence |
| --- | --- | --- |
| Seller/brand identity | A product must use its seller's brand; incompatible existing data stops migration instead of being reassigned. API returns the same error for a competitor or nonexistent brand. | `packages/db/migrations/0032_seller_integrity.sql`; `packages/db/src/schema/catalogue.ts`; `packages/api/src/routers/listings.ts` |
| COD evidence | Sellers can maintain dispatch/tracking details but cannot certify cash collection, remittance or delivery evidence, delete that evidence, or move it between orders. | `0032_seller_integrity.sql`; `packages/db/src/seller-integrity.test.ts` |
| State/history consistency | Persistence locks a sub-order, validates expected previous state and actor/reason, then writes state and transition history together. A stale concurrent command cannot add duplicate history. SQL and memory adapters agree. | `packages/db/src/repositories.ts`; `packages/domain/src/testing/in-memory-repositories.ts`; `packages/db/src/transition-concurrency.test.ts` |
| Checkout replay storage | A canonical UUID advisory lock serializes replay reads/writes; hash, response and expiry live in a checkout-service-only RLS table. Replayed data rolls back with its transaction. | `0033_checkout_replay.sql`; `packages/db/src/checkout-replay-repository.ts`; `packages/domain/src/ports/checkout-replay.ts` |
| Product material history | Database-generated, transactional before/after changes reuse the append-only revision table, record the actor and leave historical purchase snapshots unchanged. Private evidence values are redacted; technical/moderation bookkeeping is excluded. Direct fabricated revision inserts are refused. | `0034_product_revision_capture.sql`; `packages/db/src/seller-integrity.test.ts` |
| Relational tenant integrity | Order lines match product/sub-order seller identity; statement lines match payout/sub-order seller identity. Product, sub-order and payout tenant ownership is immutable through ordinary UPDATE, closing reassignment races without broadening checkout privileges. Transfers require a separately reviewed workflow. | `0035_tenant_graph_integrity.sql` |
| Returns/reviews/rates | Composite FKs keep a return's line in the same sub-order and a review's line/product/sub-order consistent. Override basis points must be within 0..10000. Preflight refuses incompatible legacy data; no prices, historical financial amounts or commission rates are recalculated. | `0035_tenant_graph_integrity.sql`; `packages/db/src/schema/fulfilment.ts`; `money.ts`; `orders.ts`; `trust.ts` |
| Migration integrity | A dedicated connection holds one advisory lock and transaction for DDL plus ledger markers. Canonical SHA-256 detects historical edits; missing/reordered history and silent permission failures fail closed. Explicit adoption is required for old filename-only ledger entries. | `packages/db/src/migrate.ts`; `packages/db/src/migrate.test.ts`; `packages/db/scripts/migrate.mjs` |
| Inventory truth | Existing product stock becomes an opening balance. Per-seller locations, locked balances, expiring idempotent reservations and append-only movements prevent overselling while retaining the existing `products.stock` interface as derived available stock. Ordinary seller stock corrections are recorded. | `0036_inventory_financial_foundations.sql`; `packages/db/src/schema/inventory-finance.ts`; `packages/db/src/data-foundations.test.ts` |
| Payment/refund safety | Provider attempts and refunds have provider-scoped idempotency keys and unique provider references. Refund identity/amount is immutable, state changes are constrained, cumulative refunds cannot exceed the order, and allocations cannot cross orders or exceed the refund. | `0036_inventory_financial_foundations.sql`; `packages/db/src/data-foundations.test.ts` |
| Payout/posting safety | A sub-order can occur in only one payout statement. Financial postings are append-only and idempotent, with database checks tying referenced sub-orders, payouts and refunds to the same seller/order graph. | `0036_inventory_financial_foundations.sql`; `packages/db/src/schema/inventory-finance.ts` |

F20 migration tooling and the product-material portion of F22 are addressed. F09/F16 receive structural guards. The policy-neutral inventory and financial foundation is complete; commercial calculation and operational workflows remain gated by the decisions below.

**Checkout integration boundary:** this branch intentionally preserves main's checkout API/UI. The replay repository is available but is not wired into order placement here. End-to-end duplicate-request protection still needs the partner's coordinated transport/use-case integration before launch. The earlier complete integration remains available for review on the preserved mixed branch; do not merge that whole branch implicitly.

## Verification

- Before migration 0036, 47 focused database tests passed across migration-ledger safety, seller/history/integrity, populated upgrades and checkout replay storage. After 0036, 32 affected database tests passed together; its four focused inventory/finance cases passed, and database typechecking passed. API and domain typechecks passed on the extracted data-only candidate.
- Native PostgreSQL 16: transition, checkout replay and concurrent inventory reservation cases passed with migrations 0000..0036. The inventory case proves one of two competing four-unit reservations wins against five units. The disposable cluster was stopped. The earlier CLI read-only plan reported migrations 0000..0035 as applied; 0036 has only been applied to disposable databases.
- The populated upgrade test verifies unchanged product identities, prices and stock; no fabricated historical revisions; refusal of invalid existing basis points; and successful upgrade after an explicit synthetic-fixture repair.
- Earlier failed synthetic fixtures were corrected; the final 47-case run is the clean result. An initial native startup wrapper resumed after cluster cleanup and then reported connection refused; it is not counted as a pass. The separate successful native run above completed before cleanup.
- No production/staging migrations, live-data reads/writes, push, remote branch, PR or deployment occurred. The two API listing-ownership tests passed (the other 97 API cases were deliberately not run). No UI/browser/build suite was repeated for this candidate.

## Safe migration procedure for later approval

The existing SQL migration files 0000..0031 are retained byte-for-byte in Git. New SQL is additive and applied in filename order; the package migration command now uses the same directory-driven runner as tests rather than a separate Drizzle journal.

1. Review the diff against current main, take a database backup and prove restoration in an isolated environment. Inspect the real catalog, deployed ledger, application role and data volume. Real backup/PITR/failover verification is an operational prerequisite, not something these disposable tests establish.
2. On an explicitly selected PostgreSQL target, use `pnpm --filter @diyar/db migrate -- --plan` with an explicitly supplied `DATABASE_URL`. This command reads only and does not load `.env` files automatically. Node 22.6+ is required.
3. A filename-only historical ledger is **unverified**. Compare its deployed baseline with deployment artifacts/history and obtain a reviewed backup before considering `--adopt-legacy-checksums`. Adoption records the reviewed local fingerprints; it cannot prove which SQL bytes ran historically. If uncertain, stop and reconcile the catalog first. Existing local PGlite stores also require explicit reviewed adoption through `applyMigrations(db, { adoptLegacyChecksums: true })`; ordinary seeding intentionally does not silently adopt them.
4. Only an authorized operator should later run `pnpm --filter @diyar/db migrate -- --apply --confirm-target HOST/DATABASE`. Add `--adopt-legacy-checksums` only for the reviewed legacy case. Use a dedicated migration connection with appropriate DDL privileges. No such operation has been run on existing data in this work.
5. Schedule a maintenance window appropriate to measured table sizes: ordinary indexes and FK validation take locks; this implementation does not claim online/zero-downtime migration. Nontransactional concurrent-index operations require a separate reviewed plan.
6. Rehearse invariants and rollback/restore before production. Application rollback should retain additive guards/history; do not drop replay records or rewrite financial history. Any failed preflight requires a separately reviewed repair, never automatic ownership/financial correction.

## Remaining launch gates and implementation order

These are genuine remaining work; no founder answer or implementation is implied:

1. Approve staff/field authorization boundaries and finish remaining tenant/privacy restrictions. Resolve catalog mismatches and legacy ledger provenance on the actual target before any deployment.
2. Inventory locking, reservations, movements and oversell protection are implemented. Approve reservation duration, automatic expiry scheduling and inspected-restock eligibility, then connect checkout/cancellation/return workflows to `reserve_inventory`, `consume_inventory` and `release_inventory`. Multi-location transfers must use paired movements in the future service workflow.
3. Provider idempotency, refund bounds/allocations, append-only postings and duplicate-payout prevention are implemented. Approve D-4 commission rates/rounding, D-5/L14/DR-03 COD cash ownership, dispute/reserve terms and DR-02 attribution; then connect these primitives to balanced settlement/reversal services and provider execution. No economic value was invented.
4. Coordinate checkout replay and inventory function integration with the partner. Provider event deduplication and payment/refund command keys exist; durable job scheduling, payment/shipping adapters and approved replay/expired-reservation cleanup still require operational integration. Tables alone do not make those application workflows retry-safe.
5. Build trusted reporting from approved financial/stock events, with seller-isolation acceptance checks and explicit metric definitions from audit artifact 07. Verify real backups, restore objectives, recovery, monitoring and availability before launch.

Variants, multiple warehouses, additional seller channels/CRM/promotions/loyalty/AI remain phased extensions from the reconciled target, not a reason to rebuild the database or create a separate physical database per brand.

## Git review record

A read-only `git fetch --no-tags origin main` on 18 October 2026 confirmed main at `d31102fc527923f012a8c19a86fb3b98be43cb18`; no newer main work was found. The candidate branches directly from that commit and has no upstream configured. `origin` is `https://github.com/AhmedAdel-17/Perfumes-Marketplace.git`; `local-source` retains the original C: implementation clone as a local reference. Full Git history is retained.

The data sources were selected from the preserved `9687020` checkpoint; only the two listing-ownership API files came from `787932f`. No mixed checkout/API validation or web changes were carried over. Original audit files are identical to the preserved checkpoint. The pre-existing SQL migrations 0000..0031, dependency lockfile, main's other application files and all web sources are unchanged. Use `git diff origin/main...HEAD --stat` for the complete commit manifest.

Review this branch with your partner before deciding to push. A push is not permission to apply migrations or launch. No push command is run automatically.
