-- =============================================================================
-- 0016 — The byline on a review is a SNAPSHOT
--
-- WHAT THIS FIXES. A published review carries a name, and the name lived on
-- `customers`. So reading reviews meant joining `customers` — and anonymous
-- traffic has no policy on that table, correctly, because one would expose
-- every customer row on the marketplace. The join therefore returned nothing,
-- and the product page showed no reviews at all to exactly the visitors it
-- exists for. Caught by an API test asserting the byline, not by reading this.
--
-- The tempting fix is a narrow read policy on `customers`. It is the wrong one:
-- RLS is row-level, so "anon may read the name column" is not something it can
-- express, and any policy that admits anonymous traffic to that table admits it
-- to phone numbers.
--
-- WHAT THIS IS INSTEAD. The byline is written onto the review when the review
-- is written, already masked to a given name and an initial by the domain's
-- `publicAuthorName`. Reading a review then touches one table.
--
-- IT IS ALSO MORE CORRECT. A review is a statement somebody made on a date, and
-- the name under it is part of that statement. Joining it live means a customer
-- correcting a typo in their own name silently rewrites the byline on a review
-- they wrote two years ago — the same reason `order_line_items` snapshots the
-- product name and `audit_log` denormalises the actor's label rather than
-- joining `platform_staff`.
--
-- NOTHING IS STORED UNMASKED. The column holds "ليلى م.", never the full name,
-- so a row that is public by policy carries nothing a public row should not.
-- =============================================================================

ALTER TABLE reviews ADD COLUMN author_label text;

-- -----------------------------------------------------------------------------
-- Backfill
--
-- A ONE-OFF for rows written before the column existed — development data only;
-- nothing is live yet. It approximates the domain's rule in SQL, which is
-- exactly the duplication `publicAuthorName` exists to prevent, and that is
-- acceptable precisely because it runs once and never again. Every review
-- written from here on gets its label from the domain.
-- -----------------------------------------------------------------------------
UPDATE reviews r
SET author_label = COALESCE(
  NULLIF(
    trim(
      split_part(trim(c.full_name), ' ', 1)
      || CASE
           WHEN position(' ' IN trim(c.full_name)) > 0
             THEN ' ' || left(split_part(trim(c.full_name), ' ', 2), 1) || '.'
           ELSE ''
         END
    ),
    ''
  ),
  'عميل ديار'
)
FROM customers c
WHERE c.id = r.customer_id AND r.author_label IS NULL;

-- Anything the join could not resolve gets the same fallback the domain uses.
UPDATE reviews SET author_label = 'عميل ديار' WHERE author_label IS NULL;

ALTER TABLE reviews ALTER COLUMN author_label SET NOT NULL;

-- A blank byline renders as a review by nobody, which reads as a bug rather
-- than as anonymity. The domain already substitutes a fallback; this is the
-- database refusing to store the case where it did not.
ALTER TABLE reviews
  ADD CONSTRAINT reviews_author_label_present CHECK (length(trim(author_label)) > 0);
