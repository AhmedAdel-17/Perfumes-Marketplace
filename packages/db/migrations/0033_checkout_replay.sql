-- P1.2.4 — Idempotent Command: response commits with its order, never before.
-- Only the server checkout service accesses this table; no phone/address stored.
-- Expiry is the documented 24-hour replay window, not a customer-data policy.
-- Rollback: roll application back while retaining this additive table. Dropping
-- it would destroy replay protection for in-flight attempts; no history rewrite.
CREATE TABLE checkout_requests (
  key uuid PRIMARY KEY,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb NOT NULL CHECK (jsonb_typeof(response) = 'object'),
  expires_at timestamptz NOT NULL
);
CREATE INDEX checkout_requests_expiry_idx ON checkout_requests (expires_at);
ALTER TABLE checkout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY checkout_requests_service ON checkout_requests
  FOR ALL USING (app.is_checkout()) WITH CHECK (app.is_checkout());
GRANT SELECT, INSERT, UPDATE ON checkout_requests TO app_user;
