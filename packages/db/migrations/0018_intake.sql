-- =============================================================================
-- 0018 — The intake service role
--
-- WHAT THIS FIXES. `sellers.status` has had `'applied'` in its enum since the
-- first migration, 0001 seeds an eight-control verification checklist the
-- moment a seller row appears, and 0001 refuses to let one go live until every
-- control passes. All of that machinery existed and NOTHING COULD EVER CREATE
-- AN APPLICATION: there is no policy admitting an insert into `sellers` except
-- the platform's. A house joined this marketplace by somebody typing SQL.
--
-- WHY A THIRD SERVICE ROLE. `checkout` places orders and `aftercare` handles
-- what happens after one arrives. An application is neither, and it happens
-- before a house exists at all. Folding it into either would widen a role whose
-- whole justification is how little it can do.
--
-- THE GUARANTEE IS IN THE WITH CHECK, NOT IN THE ROUTER. `intake` may insert a
-- seller ONLY with `status = 'applied'`. It is not that the application code
-- happens to pass that value — the database refuses any other, so a bug, an
-- injected parameter or a future refactor cannot use this path to create a live
-- house. Going live remains what it already was: a platform decision, gated by
-- the verification trigger in 0001, which this role cannot reach.
-- =============================================================================

/** True inside a seller application, and nowhere else. */
CREATE OR REPLACE FUNCTION app.is_intake() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT app.actor_role() = 'intake' $$;


-- -----------------------------------------------------------------------------
-- Applying
--
-- INSERT constrained to `applied`, and SELECT because `INSERT ... RETURNING`
-- applies the SELECT policies to the row it returns — the trap 0003 documents
-- and 0015 repeats. Without the SELECT the write succeeds and the applicant is
-- told nothing, which on a form somebody has just spent five minutes on reads
-- as a failure.
--
-- The SELECT is limited to applications, which is narrower than it needs to be
-- and is not the whole story: RLS policies are PERMISSIVE and OR'd together, so
-- `public_read_live_sellers` from 0002 already admits every role — including
-- this one — to any house whose status is `live`. An earlier version of this
-- comment claimed otherwise, and a test written to check the claim disproved it.
--
-- That is a property of the whole design rather than of this role: a live
-- house's row, `contact_phone` included, is readable by anonymous traffic at
-- the ROW level, and Postgres has no column-level row security to narrow it.
-- What actually protects those columns is that no public read path selects
-- them — asserted by `sellers-contact-columns.test.ts`, which fails if one ever
-- does. The alternative, revoking the table grant and re-granting every other
-- column by name, moves the failure to "somebody added a column and forgot",
-- which fails in production rather than in CI.
-- -----------------------------------------------------------------------------
CREATE POLICY intake_insert_sellers ON sellers
  FOR INSERT WITH CHECK (app.is_intake() AND status = 'applied');

CREATE POLICY intake_select_sellers ON sellers
  FOR SELECT USING (app.is_intake() AND status = 'applied');

-- NO UPDATE and NO DELETE. An applicant cannot edit their own application after
-- sending it, which is deliberate: the thing an operator reviews has to be the
-- thing that was submitted. Corrections go through support, where they leave a
-- record.

-- -----------------------------------------------------------------------------
-- The checklist that the insert triggers
--
-- 0001's `sellers_seed_verifications` runs AFTER INSERT and writes eight rows.
-- It is a plain trigger function, not SECURITY DEFINER, so it runs as the
-- inserting role — and `seller_verifications` has no policy for `intake`, which
-- means every application would fail on a policy violation raised by a trigger
-- nobody was looking at.
--
-- The insert is granted; nothing else is. An applicant cannot read the
-- checklist, and cannot mark a control as passed.
-- -----------------------------------------------------------------------------
CREATE POLICY intake_insert_verifications ON seller_verifications
  FOR INSERT WITH CHECK (app.is_intake());


-- -----------------------------------------------------------------------------
-- What an application actually says
--
-- `sellers` was designed around a house that already exists. An APPLICATION has
-- to carry the two things an operator needs before deciding: what this house
-- makes, and whether the person applying is who they say they are.
--
-- Both nullable, because a live house seeded before this migration has neither
-- and refusing to read those rows would take the shopfront down.
-- -----------------------------------------------------------------------------
ALTER TABLE sellers
  ADD COLUMN application_note text,
  ADD COLUMN applied_at timestamp with time zone;

COMMENT ON COLUMN sellers.application_note IS
  'What the applicant wrote about their house, in their own words. Read by an operator before any verification begins.';
