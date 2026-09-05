-- =============================================================================
-- 0013 — Site-level content: announcements, and what opens the homepage
--
-- The editorial pages (0009) cover prose. Two things a marketplace needs that
-- a page cannot express:
--
--   announcements    a time-boxed notice across the whole site
--   site_curation    which product opens the homepage, and which are featured
--
-- WHY ANNOUNCEMENTS ARE NOT REVIEWED. Every other piece of content here goes
-- draft → review → published, and an announcement deliberately does not. Its
-- entire purpose is to say something urgent — "التوصيل متأخر بسبب العيد" — and
-- a notice that needs a second approver is a notice that goes up after the
-- delay it was warning about. The safeguards are different in kind: it is one
-- short line, it carries no markup, it is attributable to a named operator, and
-- it EXPIRES BY ITSELF.
--
-- That last one is the important one. An announcement that has to be taken down
-- by hand is an announcement still apologising for last Eid in November. The
-- window is required, not optional, so there is no way to post one that does
-- not end.
--
-- WHY CURATION IS A SINGLE ROW. There is one homepage. A table that could hold
-- two rows would need a rule about which one counts, and that rule would be
-- read from a screen at three in the morning by someone who did not write it.
-- One row, enforced by the database.
--
-- WHAT IS DELIBERATELY NOT HERE: the hero's headline and its brass second line.
-- Those are a typographic composition — two lines, sized against each other,
-- with a colour break that carries meaning — not a text field. Handing them to
-- an editor would let the site's opening be broken by someone doing their job
-- correctly. Choosing WHICH PRODUCT opens the site is the curation lever that
-- matters, and today that is `products[0]`, which is to say nobody's decision.
-- =============================================================================

CREATE TABLE announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- One line. The length is the constraint that keeps it a notice rather than
  -- an article: past this it stops fitting on a phone in one or two lines and
  -- starts pushing the shop below the fold on every screen of the site.
  message text NOT NULL,

  -- Optional, internal only. Same rule as the content blocks: an outbound link
  -- authorable from a console is the cheapest way to turn a trusted domain into
  -- a phishing host, and this one would appear on EVERY page.
  href text,

  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,

  created_by uuid NOT NULL REFERENCES platform_staff(id),
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT announcements_message_length
    CHECK (char_length(btrim(message)) BETWEEN 1 AND 160),
  CONSTRAINT announcements_window_ordered CHECK (ends_at > starts_at),
  -- A window longer than a season is a permanent banner wearing a date, which
  -- is the failure this whole design exists to prevent.
  CONSTRAINT announcements_window_bounded
    CHECK (ends_at <= starts_at + interval '90 days'),
  CONSTRAINT announcements_href_internal
    CHECK (href IS NULL OR (href ~ '^/' AND href !~ '^//' AND href !~ '://'))
);--> statement-breakpoint

-- The only query this table has: what is showing right now.
CREATE INDEX announcements_window_idx ON announcements (starts_at DESC, ends_at);--> statement-breakpoint

CREATE TABLE site_curation (
  -- One row, forever. `singleton` is CHECKed to a constant and made the primary
  -- key, so a second row is a primary-key violation rather than a silent second
  -- opinion about what the homepage should look like.
  singleton boolean PRIMARY KEY DEFAULT true,

  -- Which product opens the site. Null means "whatever the catalogue lists
  -- first", which is the behaviour up to now — stated rather than assumed, and
  -- ON DELETE SET NULL so unpublishing a product cannot leave the homepage
  -- pointing at nothing.
  hero_product_id uuid REFERENCES products(id) ON DELETE SET NULL,

  -- Ordered. A set would lose the running order, and the running order is the
  -- entire content of a curation decision.
  featured_product_ids uuid[] NOT NULL DEFAULT '{}',

  updated_by uuid REFERENCES platform_staff(id),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT site_curation_is_singleton CHECK (singleton = true),
  -- More than a dozen "featured" products is a catalogue, not a selection.
  CONSTRAINT site_curation_featured_bounded
    CHECK (array_length(featured_product_ids, 1) IS NULL
           OR array_length(featured_product_ids, 1) <= 12)
);--> statement-breakpoint

-- The row exists from the start, so every read is a read and never a
-- read-or-create. A caller that has to remember to create a singleton is a
-- caller that will forget on exactly one code path.
INSERT INTO site_curation (singleton) VALUES (true);--> statement-breakpoint

-- =============================================================================
-- Row-level security
-- =============================================================================

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE announcements FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE site_curation ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE site_curation FORCE ROW LEVEL SECURITY;--> statement-breakpoint

/*
 * The public reads only what is CURRENTLY showing.
 *
 * Not every announcement — a scheduled one is a plan, and a plan readable by
 * anyone who asks is a plan that leaks. "Free delivery from Sunday" visible on
 * Thursday is a discount announced three days early to whoever was looking.
 */
CREATE POLICY public_read_current_announcement ON announcements
  FOR SELECT USING (now() >= starts_at AND now() < ends_at);--> statement-breakpoint

CREATE POLICY platform_manage_announcements ON announcements
  FOR ALL USING (app.is_platform()) WITH CHECK (app.is_platform());--> statement-breakpoint

-- Curation is public by design: it says which products the homepage shows, and
-- the homepage shows them. There is nothing here that is not already visible
-- the moment anybody loads the site.
CREATE POLICY public_read_curation ON site_curation
  FOR SELECT USING (true);--> statement-breakpoint

CREATE POLICY platform_manage_curation ON site_curation
  FOR ALL USING (app.is_platform()) WITH CHECK (app.is_platform());--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON announcements TO app_user;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON site_curation TO app_user;
