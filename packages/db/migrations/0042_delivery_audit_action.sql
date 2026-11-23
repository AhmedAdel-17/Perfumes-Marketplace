-- Delivery confirmation becomes an audited decision (16 Nov 2026, docs/LAUNCH_TASKS.md B2).
-- Marking a sub-order delivered starts the house's reserve clock and opens reviews, so who
-- pressed it is a question the audit trail must answer (MVP gate 6). Until now the
-- transition row recorded the ACTOR KIND ('platform') and nothing recorded the person.
-- rollback: additive. An enum value cannot be dropped in place; leave it. Entries already
-- written with it stay readable, and an older app simply never writes it.
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'delivery_confirmation';
