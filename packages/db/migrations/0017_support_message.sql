-- =============================================================================
-- 0017 — A support ticket carries what the person actually wrote
--
-- WHAT THIS FIXES. `support_tickets` has existed since 0000 with a `subject`
-- and no body. A ticket whose entire content is a 140-character subject line is
-- not a support system; it is a subject line. Nothing had ever written to the
-- table, so nobody had discovered it.
--
-- It also had no way to reach the person back. `customer_id` is nullable — the
-- whole product is built around guests — so a ticket from somebody who has
-- never ordered pointed at nothing and named nobody.
--
-- WHY THE CONTACT DETAILS SIT ON THE TICKET rather than creating a customer.
-- The phone is the identity on this marketplace, and it is tempting to run
-- every support form through `find_or_create_by_phone`. That would mean storing
-- a customer record for somebody who asked a question and never bought
-- anything, and it would mean widening the `aftercare` service role to INSERT
-- into `customers` — a role whose entire justification is how little it can do.
--
-- So the ticket is self-contained, and `customer_id` is filled in only when the
-- phone already belongs to a customer. A returning buyer's tickets still join
-- to their record; a stranger's question does not create one.
-- =============================================================================

ALTER TABLE support_tickets
  ADD COLUMN message text,
  ADD COLUMN contact_name text,
  ADD COLUMN contact_phone text;

-- Nothing has ever written to this table, so there is nothing to backfill. The
-- columns are added nullable and immediately tightened, which is the same
-- two-step a populated table would need and costs nothing here.
ALTER TABLE support_tickets
  ALTER COLUMN message SET NOT NULL,
  ALTER COLUMN contact_name SET NOT NULL,
  ALTER COLUMN contact_phone SET NOT NULL;

-- The same shape `customers.phone` is held to. A ticket we cannot ring back is
-- a ticket that cannot be resolved, and the place to catch a malformed number
-- is where it is entered.
ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_phone_shape
    CHECK (contact_phone ~ '^(\+201|01)[0125]{1}[0-9]{8}$');

ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_message_present CHECK (length(trim(message)) > 0),
  ADD CONSTRAINT support_tickets_subject_present CHECK (length(trim(subject)) > 0);

-- Looking a ticket up is reference AND phone, exactly as order tracking is.
-- Without this index that lookup is a sequential scan on the one table whose
-- rows arrive fastest when something is going wrong.
CREATE INDEX support_tickets_phone_idx ON support_tickets (contact_phone);
