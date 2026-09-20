-- =============================================================================
-- 0027 — sign-in stops being a superuser
--
-- WHAT THIS FIXES (ADR-10, task P3.4.1; DEBT_REGISTER #14). The three reads
-- that decide WHO YOU ARE — resolve a phone to a house, resolve a phone to an
-- operator, and check that a cookie's subject has not been revoked — ran from
-- `apps/web` on the raw connection. That connection is a superuser, and
-- Postgres never applies row-level security to a superuser, whatever the
-- policies say and whatever GUC is set. So the reads that gate every other
-- read were the ones no policy governed.
--
-- It was not a theory. Task P1.4.6 moved a house's contact details to
-- `seller_contacts`, a table that grants anonymous traffic nothing, and seller
-- sign-in kept working — which is only possible if nothing was being enforced.
--
-- WHAT CHANGES. Those reads move behind `IdentityRepository` and run inside a
-- Unit of Work as the `identity` role, which migration 0025 already created for
-- the login-code functions. This migration gives it the three SELECT policies
-- it needs to resolve a principal, and nothing else.
--
-- WHY THIS ROLE AND NOT `anon`. A visitor is `anon`, and `anon` must never read
-- `seller_contacts` — that is the whole of 0026. `identity` is a SERVICE role
-- in the sense 0003 established: set only inside a sign-in transaction on the
-- server, reachable from a browser exactly never, and carrying the narrowest
-- grant that lets one specific flow work.
--
-- WHAT IT STILL CANNOT DO, by construction rather than by convention: no
-- INSERT, no UPDATE, no DELETE anywhere; no orders, no payouts, no catalogue;
-- and no read of any column it does not need. The repository above it returns
-- ids and booleans only, so even a caller that wanted a phone number could not
-- get one back.
--
-- rollback: DROP POLICY identity_read_seller_contacts ON seller_contacts;
-- DROP POLICY identity_read_seller_staff ON seller_staff;
-- DROP POLICY identity_read_platform_staff ON platform_staff;
-- =============================================================================

-- The phone belongs to the house (0026). Sign-in matches on it and returns an
-- id, never the number itself.
CREATE POLICY identity_read_seller_contacts ON seller_contacts
  FOR SELECT USING (app.is_identity());

-- The session belongs to a staff member, so resolving a house to a principal
-- and revalidating a cookie both read this table.
CREATE POLICY identity_read_seller_staff ON seller_staff
  FOR SELECT USING (app.is_identity());

-- The operator console's half of the same flow.
CREATE POLICY identity_read_platform_staff ON platform_staff
  FOR SELECT USING (app.is_identity());
