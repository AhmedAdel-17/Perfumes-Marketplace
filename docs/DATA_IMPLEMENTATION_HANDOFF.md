# Focused database integrity merge

Prepared 24 October 2026 from main `44bee7c`. Original work remains on
`codex/diyar-data-review` at `5f64e87`; this branch is a separate proposal.

## Included

- 0038: brand ownership and platform-controlled COD evidence guards.
- 0039: automatic product change history.
- 0040: tenant-consistent relationships and bounded commission basis points.
- 0041: duplicate payout-line preflight and uniqueness for existing statements.
- Locked, expected-state order transitions; serialized per-seller payout selection
  excludes sub-orders already represented in a statement. This is a narrow
  duplicate-settlement fix, not approval of the future money ledger.
- Atomic, advisory-locked, checksummed migrations. Existing local PGlite stores
  can explicitly adopt legacy checksums without changing their data.

## Existing local databases

Back up the PGlite folder while it is closed. For a store created from main:
`pnpm --filter @diyar/web seed --adopt-legacy-checksums`.
Adoption preserves applied timestamps and rows, still rejects changed known
checksums, unknown migration history and unsafe preflight data. Then use normal
`pnpm dev`. Network migrations retain explicit adoption and strict checksums.

A store that applied the original branch's 0032–0037 cannot use the renumbered
history. Preserve it and its backup; do not delete it or edit its ledger. Use a
separate development store for this branch. Any valuable data needs a separately
reviewed export/import plan. No existing database has been opened or changed by
this review-fix work; tests use disposable stores only.

## Excluded pending integration and decisions

Checkout replay storage and ports remain on the original branch. Debt #12 stays
open until placement uses the agreed scoped idempotency design end to end.

The original inventory and alternative money tables/triggers are excluded.
P3.1.1 reconciliation tests and approval of ADR-03 precede ledger implementation;
the pilot payout switch and manual-money policy remain in force. Inventory and
expiry jobs remain P3.2.1 work. Product revisions therefore have no reservation
sync trigger generating stock-only history.

The original customer-data migration is excluded. Birth date and gender remain
the requesting founder's requirements, pending joint customer-policy approval.
The replacement must use the existing analytics vocabulary, define attribution,
check purpose-specific consent at linking and recording, support verified
individual erasure, and have an agreed retention period. No model-training
purpose or second event store is activated by this branch.

The point-in-time audit and inventory documents remain available on the original
branch and are not imported as current system documentation.

## Limits

This does not complete refunds, two-person payout approval, payout status flows,
commission policy, checkout reservations or production backup/restore. A statement
line is treated as already allocated even if its payout is not yet marked paid;
the future ledger must explicitly support reversals and reallocation. Do not
enable real payouts based on this patch alone.


## Validation

- Domain: all 737 tests passed.
- API: 372 tests passed on the full run; its sole failing assertion counted
  held calculation rows as persisted payout lines. After correcting the
  assertion to inspect the saved statement, all 103 tests in api.test.ts passed.
  The original two payout crashes no longer occur.
- Focused migrations, tenant integrity and lifecycle: 50 tests passed.
- Migration runner: all eight tests passed, including a populated 38-migration
  main-era legacy store, explicit adoption, unchanged customer data/timestamps,
  four pending migrations and a subsequent no-op run.
- Native PostgreSQL 16: both independent-connection tests passed (stale order
  transitions and concurrent payout allocation). Disposable servers stopped.
- Domain, database and API typechecks passed. Production web build passed.
- Whole database suite: 482 tests passed; two optional native-PostgreSQL
  cases skipped in that run and both passed in the separate native run.
  PGlite does not establish PostgreSQL lock behavior.

No remote branch, PR, production migration or deployment was performed.
