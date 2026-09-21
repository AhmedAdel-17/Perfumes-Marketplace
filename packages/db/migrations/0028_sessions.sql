-- =============================================================================
-- 0028 — a session is a row, so it can be ended
--
-- WHAT THIS FIXES (task P3.4.2; docs/architecture/05 §1, finding M15). A
-- signed-in house or operator was a signed cookie and nothing else. The cookie
-- carried the principal, and the server re-checked on every request that the
-- staff member had not been removed. That made REMOVING A PERSON effective on
-- the next click, and it made everything short of that impossible:
--
--   · signing out deleted the cookie from ONE browser. A copy taken before —
--     from a shared laptop, a synced profile, a stolen device — kept working
--     for the rest of its twelve hours, because nothing on the server knew it
--     had been signed out;
--   · "sign me out everywhere", the only honest answer to "I lost my phone",
--     could not be expressed at all;
--   · nobody could say which sessions were open, from where, since when.
--
-- WHAT CHANGES. The cookie now carries a session id and an HMAC of it, nothing
-- else. The session is a row here. Signing out revokes the row; signing out
-- everywhere revokes every row for a principal in one statement; and the
-- per-request check reads the row, joined to the staff record, so a revoked
-- session and a removed staff member are refused by the same query.
--
-- EXPIRY IS THE DATABASE'S CLOCK, as it is for one-time codes (0025). The
-- caller says how long; `now()` says when. A container with a skewed clock can
-- therefore not extend a session, and the check "is this expired" is made by
-- the same clock that stamped it.
--
-- IMMUTABLE EXCEPT FOR ONE COLUMN, set once. The trigger below refuses any
-- UPDATE that touches anything but `revoked_at`, and refuses to change
-- `revoked_at` once it is set. So a session cannot be extended, moved to a
-- different person, re-pointed at a different house, or un-revoked — by the
-- `identity` role or by anyone else short of the owner dropping the trigger.
-- RLS cannot say "only this column"; a trigger can.
--
-- IP AND USER-AGENT ARE KEPT AS KEYED HASHES, never raw. They exist to answer
-- "was this session opened from somewhere unusual" and "is this the same
-- browser", both of which compare values and neither of which needs to read
-- one. A plain SHA-256 of an IPv4 address is reversible by enumerating all four
-- billion of them in minutes, so the hash is an HMAC under the session secret,
-- computed in the application. PDPL 151/2020 asks for minimal collection; this
-- is the minimum that still answers the question.
--
-- rollback: DROP TABLE sessions; DROP FUNCTION app.sessions_only_revoke();
-- =============================================================================

CREATE TABLE sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  /** Which console this session opens. A house's session never opens `/ops`. */
  audience     text NOT NULL,

  /*
   * WHO. For a house this is the staff member's `auth_user_id`; for an
   * operator it is `platform_staff.id`. Not a foreign key, because it points at
   * two different tables depending on `audience` — the joins in the repository
   * are what tie it to a live person, and they refuse a removed one.
   */
  principal_id uuid NOT NULL,

  /** The house, for a seller session. Null for an operator. */
  seller_id    uuid REFERENCES sellers(id) ON DELETE CASCADE,

  issued_at    timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,

  ip_hash      text,
  ua_hash      text,

  CONSTRAINT sessions_audience_known CHECK (audience IN ('seller', 'platform')),
  -- A seller session names its house and an operator session does not. Mixing
  -- them would make "which house is this" a question with two answers.
  CONSTRAINT sessions_seller_matches_audience
    CHECK ((audience = 'seller') = (seller_id IS NOT NULL)),
  CONSTRAINT sessions_expires_after_issue CHECK (expires_at > issued_at),
  CONSTRAINT sessions_revoked_after_issue CHECK (revoked_at IS NULL OR revoked_at >= issued_at)
);

COMMENT ON TABLE sessions IS
  'One row per sign-in. The cookie carries the id and an HMAC of it. Immutable '
  'except revoked_at, which is set once (see sessions_only_revoke).';

-- "Sign out everywhere" is one UPDATE over a principal's open sessions, and it
-- is asked of a table that grows with every sign-in. Partial, because a revoked
-- session is never looked up by principal again.
CREATE INDEX sessions_open_by_principal_idx
  ON sessions (audience, principal_id) WHERE revoked_at IS NULL;

-- -----------------------------------------------------------------------------
-- Immutable except revocation
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.sessions_only_revoke() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'session % is already revoked; a revoked session cannot be changed', OLD.id;
  END IF;

  IF NEW.id           IS DISTINCT FROM OLD.id
  OR NEW.audience     IS DISTINCT FROM OLD.audience
  OR NEW.principal_id IS DISTINCT FROM OLD.principal_id
  OR NEW.seller_id    IS DISTINCT FROM OLD.seller_id
  OR NEW.issued_at    IS DISTINCT FROM OLD.issued_at
  OR NEW.expires_at   IS DISTINCT FROM OLD.expires_at
  OR NEW.ip_hash      IS DISTINCT FROM OLD.ip_hash
  OR NEW.ua_hash      IS DISTINCT FROM OLD.ua_hash THEN
    RAISE EXCEPTION 'a session may only be revoked, never altered';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER sessions_only_revoke
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION app.sessions_only_revoke();

-- -----------------------------------------------------------------------------
-- Row-level security
-- -----------------------------------------------------------------------------
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE  ROW LEVEL SECURITY;

-- Operators: to see who is signed in, and to end a session on someone's behalf.
CREATE POLICY platform_all ON sessions
  FOR ALL USING (app.is_platform()) WITH CHECK (app.is_platform());

-- The sign-in flow: open a session, read it back on every request, revoke it.
-- Three verbs and no DELETE: a session's history is kept, and "signed out" is
-- a fact about a row rather than its absence.
CREATE POLICY identity_read_sessions ON sessions
  FOR SELECT USING (app.is_identity());

CREATE POLICY identity_open_sessions ON sessions
  FOR INSERT WITH CHECK (app.is_identity());

CREATE POLICY identity_revoke_sessions ON sessions
  FOR UPDATE USING (app.is_identity()) WITH CHECK (app.is_identity());
