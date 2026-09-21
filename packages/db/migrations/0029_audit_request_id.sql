-- =============================================================================
-- 0029 — every audit entry knows which request wrote it
--
-- WHY (task P1.4.3, docs/architecture/09 §1). The audit trail answers "who
-- decided what, and when". It could not answer "and what else happened in that
-- same request" — which is the question an incident asks. A payout approval,
-- the error that followed it, and the log lines around both shared nothing that
-- joined them. Now they share a request id: the one the middleware generates,
-- the one on every structured log line, and the one printed inside the Arabic
-- error message a customer can read out to support.
--
-- A DEFAULT, NOT A PARAMETER. There are audit writes in a dozen routers. Adding
-- a request id to every `audit.record()` call would be a dozen places to forget
-- it, and the forgotten one would be the entry somebody needs. Instead the Unit
-- of Work sets `app.request_id` once per transaction — beside `app.actor_role`
-- and `app.actor_id`, the same mechanism the actor already travels by — and this
-- column fills itself. A write that happens outside a request (a migration, a
-- script, a future job) simply leaves it NULL, which is true.
--
-- `nullif(..., '')` because an unset GUC read with `missing_ok` is an empty
-- string, and '' is not a uuid: without it, every audit write outside a request
-- would fail, and the audit trail would start refusing to record things.
--
-- rollback: DROP INDEX audit_log_request_idx; ALTER TABLE audit_log DROP COLUMN request_id;
-- =============================================================================

ALTER TABLE audit_log
  ADD COLUMN request_id uuid
  DEFAULT nullif(current_setting('app.request_id', true), '')::uuid;

COMMENT ON COLUMN audit_log.request_id IS
  'The request that wrote this entry. Filled from the app.request_id GUC the Unit '
  'of Work sets per transaction; NULL for writes outside a request.';

-- Support's lookup: "everything that request did". Partial, because most rows
-- written before this migration, and every row written by a script, have none.
CREATE INDEX audit_log_request_idx ON audit_log (request_id) WHERE request_id IS NOT NULL;
