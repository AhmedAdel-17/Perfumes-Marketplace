-- =============================================================================
-- 0026 — a house's contact details leave the public row
--
-- WHAT THIS FIXES (DEBT_REGISTER #3). `public_read_live_sellers` in 0002 is
-- `USING (status = 'live')` with no role predicate, and Postgres policies are
-- PERMISSIVE and OR'd together, so anonymous traffic reaches the whole ROW of
-- every trading house. `contact_phone` and `contact_email` ride along on that
-- row and Postgres has no column-level row security to stop them. A public
-- deployment therefore hands every pilot house's mobile number to the first
-- person who asks for it, in bulk, through the ordinary catalogue path.
--
-- WHAT PROTECTED THEM UNTIL NOW was that no public query happened to SELECT
-- them, asserted by a static test over the source. That is a real guard and it
-- is the wrong shape: it protects the columns from this repository's own
-- queries and from nothing else. Anyone holding an `anon` session could ask
-- Postgres directly. 0018's own comment says as much, and says the alternative
-- considered then — revoking the table grant and re-granting every other column
-- by name — trades a failure caught in CI for one that fails in production in
-- front of a customer.
--
-- THIS IS THE THIRD OPTION, and the one that was available all along: if the
-- columns are not on the public row, no policy on the public row can expose
-- them. `seller_contacts` is a separate table with its own policies and NO
-- public read. The storefront keeps everything it needs — trading name, story,
-- city, service area — and loses the two fields it never rendered.
--
-- EXPAND AND CONTRACT IN ONE MIGRATION, deliberately (ADR-13). The rule exists
-- so that rolling the application back never needs a schema rollback. There is
-- nothing to roll back to: P1.4.4 has not run and this product is deployed
-- nowhere. Splitting it would mean shipping a migration that leaves the hole
-- open and a promise to close it later, which is how a security fix becomes a
-- backlog item. Recorded here so the exception is visible rather than assumed.
--
-- rollback: ALTER TABLE sellers ADD COLUMN contact_phone text, ADD COLUMN
-- contact_email text; UPDATE sellers s SET contact_phone = c.contact_phone,
-- contact_email = c.contact_email FROM seller_contacts c WHERE c.seller_id =
-- s.id; ALTER TABLE sellers ALTER COLUMN contact_phone SET NOT NULL; DROP TABLE
-- seller_contacts;
-- =============================================================================

CREATE TABLE seller_contacts (
  seller_id     uuid PRIMARY KEY REFERENCES sellers(id) ON DELETE CASCADE,
  contact_phone text NOT NULL,
  contact_email text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE seller_contacts IS
  'A house''s private contact details. Deliberately NOT on `sellers`, whose row '
  'is readable by anonymous traffic through public_read_live_sellers. No public '
  'policy exists here and none should be added.';

-- -----------------------------------------------------------------------------
-- Carry every existing house across before the columns go.
--
-- `contact_phone` is NOT NULL on the old table, so this cannot lose a row; the
-- count assertion below proves it rather than trusting it, because a backfill
-- that silently moved less than everything would show up as houses that cannot
-- sign in, days later, one at a time.
-- -----------------------------------------------------------------------------
INSERT INTO seller_contacts (seller_id, contact_phone, contact_email)
SELECT id, contact_phone, contact_email FROM sellers;

DO $$
DECLARE missing bigint;
BEGIN
  SELECT count(*) INTO missing
  FROM sellers s LEFT JOIN seller_contacts c ON c.seller_id = s.id
  WHERE c.seller_id IS NULL;

  IF missing > 0 THEN
    RAISE EXCEPTION 'backfill left % house(s) without contact details', missing;
  END IF;
END $$;

-- Sign-in resolves a phone to a house on every attempt; without this it is a
-- sequential scan of every house on the platform, on an unauthenticated path.
CREATE INDEX seller_contacts_phone_idx ON seller_contacts (contact_phone);

-- -----------------------------------------------------------------------------
-- Row-level security
--
-- ENABLE and FORCE, in the shape 0002 uses for every table holding seller,
-- customer or money data: FORCE is what makes the policies bind the table owner
-- too, so a pool that happens to connect as the owner does not quietly see
-- everything.
-- -----------------------------------------------------------------------------
ALTER TABLE seller_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_contacts FORCE  ROW LEVEL SECURITY;

-- Operators, for the intake console and support. Same blanket shape as 0002's
-- `platform_all`, so platform actions stay inside RLS and remain attributable.
CREATE POLICY platform_all ON seller_contacts
  FOR ALL USING (app.is_platform()) WITH CHECK (app.is_platform());

-- A house sees its own details and no other house's.
CREATE POLICY seller_read_own_contact ON seller_contacts
  FOR SELECT USING (seller_id = app.staff_seller_id());

-- The intake role creates the row when a house applies (0018). INSERT only, and
-- only against a seller that is still `applied` — the same restriction 0018 put
-- on the seller row itself, repeated here rather than inherited, because a
-- policy that depends on another table's policy is a policy nobody can read.
CREATE POLICY intake_insert_contact ON seller_contacts
  FOR INSERT WITH CHECK (app.is_intake() AND EXISTS (
    SELECT 1 FROM sellers s WHERE s.id = seller_contacts.seller_id AND s.status = 'applied'));

-- THERE IS NO PUBLIC POLICY, and that is the entire point of this migration.
-- Anonymous traffic reads `sellers` and reaches nothing here.

-- -----------------------------------------------------------------------------
-- Contract: the columns leave the public row.
-- -----------------------------------------------------------------------------
ALTER TABLE sellers DROP COLUMN contact_phone;
ALTER TABLE sellers DROP COLUMN contact_email;
