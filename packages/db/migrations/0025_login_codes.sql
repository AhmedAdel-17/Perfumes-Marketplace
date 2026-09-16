-- =============================================================================
-- 0025 — one-time codes that survive a restart
--
-- WHAT THIS FIXES (DEBT_REGISTER #1). Sign-in codes for houses and for
-- operators have lived in a `Map` on `globalThis`. That store does not survive
-- a restart and does not exist across instances, so the day the web app runs on
-- two containers, half of all sign-ins fail — and the symptom ("the code is
-- wrong") points at the SMS provider, the phone, the clock, and never at this.
-- The debt's own note says the store must be replaced TOGETHER with the SMS
-- adapter and never separately; that still holds. What changes here is that the
-- STORE stops being the blocker, so the day a contract is signed only the
-- sender is swapped.
--
-- It is also what the mobile apps force. A phone talks to whichever container
-- answers, and an in-process code store means sign-in works or not depending on
-- which one that was.
--
-- THE CODE IS NOT STORED. Only a hash of it. The `Map` held plaintext, which
-- was defensible while it lived in one process's heap and died with it; a table
-- is dumped, replicated and restored, and a plaintext one-time code in a backup
-- is a credential in a backup. The digest is SHA-256 over the phone and the
-- code together, so a stolen dump cannot be reversed with a six-digit rainbow
-- table — there are only a million codes, and without the phone in the digest
-- every row for the same code would look identical.
--
-- THIS IS NOT A TABLE YOU QUERY. It is a mechanism with three operations, and
-- all three are `SECURITY DEFINER` functions guarded on the actor GUC:
--
--     app.issue_login_code()          replace the pending code for a number
--     app.verify_login_code()         check one and consume it
--     app.purge_expired_login_codes() drop what nobody came back for
--
-- There are deliberately NO POLICIES. Row-level security is enabled and FORCED,
-- so direct SQL reaches nothing: a SELECT returns no rows, an UPDATE or DELETE
-- matches none, an INSERT is refused. The functions bypass that because a
-- definer runs as the owner — which is exactly why each one's first line checks
-- `app.is_identity()`. EXECUTE is granted to PUBLIC by default and every actor
-- on this system connects as the same database role, so that check is the whole
-- of the protection, in the same shape 0023's purge uses.
--
-- WHY NOT POLICIES AND PLAIN SQL. That was the first attempt and the database
-- refused it, for a reason worth recording: with no SELECT policy, `INSERT …
-- ON CONFLICT DO UPDATE` cannot read the row it would update, and UPDATE and
-- DELETE match nothing because they cannot find rows either. Adding a SELECT
-- policy would have made all three work — and would have handed the sign-in
-- path the ability to read every pending code in the system, which is precisely
-- what this table exists to prevent. The mechanism moved; the guarantee did not.
--
-- WHY A SERVICE ROLE AT ALL. Whoever is asking for a code is, by definition,
-- not signed in: `anon` is the only role they can have. `identity` is the fifth
-- service role, set only inside the sign-in transaction on the server, and
-- reachable from a browser exactly never. See 0003 for the reasoning this
-- follows.
-- =============================================================================

/** True inside a sign-in transaction, and nowhere else. */
CREATE OR REPLACE FUNCTION app.is_identity() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT app.actor_role() = 'identity' $$;--> statement-breakpoint

CREATE TABLE login_codes (
  -- The phone is the identity everywhere else in this system, and it is the
  -- natural key here: one pending code per number. A second request replaces
  -- the first rather than adding to it, which is what a person expects when
  -- they press "send it again" — and it means a flood of requests cannot grow
  -- this table.
  phone text PRIMARY KEY,

  /** Which portal the code is for. A house's code must not open the console. */
  audience text NOT NULL,

  /**
   * SHA-256 of the phone and the code. Never the code.
   *
   * 64 lowercase hex characters, constrained rather than merely documented: a
   * column that accepts anything eventually holds something else, and the thing
   * it would hold here is the plaintext this migration exists to avoid.
   */
  code_digest text NOT NULL,

  expires_at timestamp with time zone NOT NULL,

  /**
   * Counted BEFORE the comparison, so a wrong guess costs an attempt whether or
   * not anything else about the request was valid. The ceiling is enforced in
   * the verification function, not by the application.
   */
  attempts integer NOT NULL DEFAULT 0,

  created_at timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT login_codes_audience_known CHECK (audience IN ('seller', 'platform')),
  CONSTRAINT login_codes_digest_shape CHECK (code_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT login_codes_attempts_sane CHECK (attempts >= 0)
);--> statement-breakpoint

-- Expired rows are swept when the next code is issued. The index is what makes
-- that cheap enough to do on every issue rather than on a timer nobody owns —
-- the same reasoning the in-process rate limiter uses.
CREATE INDEX login_codes_expires_idx ON login_codes (expires_at);--> statement-breakpoint

ALTER TABLE login_codes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE login_codes FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- No GRANT and no policies, deliberately — see the header. 0002's
-- ALTER DEFAULT PRIVILEGES may still hand `app_user` table privileges on
-- anything created later, which changes nothing: with RLS forced and no policy,
-- privilege alone reaches no row.

-- =============================================================================
-- Issuing
--
-- Expiry is computed HERE, from the database's clock. A caller that passed an
-- absolute moment would be trusting whichever container's clock answered, and
-- the failure mode of a skewed clock is a code that is accepted long after it
-- should have died — silently, and only on one machine.
-- =============================================================================
CREATE OR REPLACE FUNCTION app.issue_login_code(
  in_phone text,
  in_audience text,
  in_digest text,
  ttl_seconds integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT app.is_identity() THEN
    RAISE EXCEPTION 'issue_login_code is a sign-in operation';
  END IF;
  IF ttl_seconds IS NULL OR ttl_seconds < 1 THEN
    RAISE EXCEPTION 'ttl_seconds must be at least 1';
  END IF;

  -- Rows belonging to somebody who asked for a code once and never came back.
  DELETE FROM login_codes WHERE expires_at <= now();

  -- Pressing "send it again" REPLACES the pending code rather than adding to
  -- it: two live codes for one number doubles the guessing surface and makes
  -- the attempt ceiling meaningless.
  INSERT INTO login_codes (phone, audience, code_digest, expires_at, attempts)
  VALUES (in_phone, in_audience, in_digest, now() + make_interval(secs => ttl_seconds), 0)
  ON CONFLICT (phone) DO UPDATE
    SET audience = excluded.audience,
        code_digest = excluded.code_digest,
        expires_at = excluded.expires_at,
        attempts = 0,
        created_at = now();
END $$;--> statement-breakpoint

COMMENT ON FUNCTION app.issue_login_code(text, text, text, integer) IS
  'Replaces the pending one-time code for a number. Sign-in role only. Expiry comes from the database clock.';--> statement-breakpoint

-- =============================================================================
-- Verifying, in one statement
--
-- WHY A FUNCTION rather than three queries in TypeScript. The check is
-- read-modify-write on a row that an attacker is, by construction, hammering:
-- read the attempts, compare the digest, increment or delete. Done as separate
-- statements, two simultaneous guesses each read `attempts = 4`, each write 5,
-- and the ceiling is a suggestion. Here it is one statement under the row's own
-- lock.
--
-- The verdicts are deliberately COARSE at the boundary: "wrong" and "expired"
-- become one message to the person, because telling somebody guessing which
-- half of the problem to work on is help they have not earned.
-- =============================================================================
CREATE OR REPLACE FUNCTION app.verify_login_code(
  in_phone text,
  in_audience text,
  in_digest text,
  max_attempts integer
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE row_attempts integer;
DECLARE row_expires timestamp with time zone;
DECLARE row_digest text;
BEGIN
  IF NOT app.is_identity() THEN
    RAISE EXCEPTION 'verify_login_code is a sign-in operation';
  END IF;

  -- FOR UPDATE: the lock is the whole point. Without it the attempt ceiling is
  -- advisory under concurrency, which is precisely when it matters.
  SELECT attempts, expires_at, code_digest
    INTO row_attempts, row_expires, row_digest
    FROM login_codes
   WHERE phone = in_phone AND audience = in_audience
     FOR UPDATE;

  -- No pending code, a code for the OTHER portal, and an expired one all give
  -- the same answer — so neither the absence of an account nor which console a
  -- number belongs to is observable by asking.
  IF NOT FOUND THEN
    RETURN 'expired';
  END IF;

  IF row_expires <= now() THEN
    DELETE FROM login_codes WHERE phone = in_phone;
    RETURN 'expired';
  END IF;

  -- Counted before the comparison. A guess costs an attempt even when it is
  -- malformed, or the ceiling is bypassed by sending nonsense.
  row_attempts := row_attempts + 1;
  IF row_attempts > max_attempts THEN
    DELETE FROM login_codes WHERE phone = in_phone;
    RETURN 'too_many_attempts';
  END IF;

  IF row_digest <> in_digest THEN
    UPDATE login_codes SET attempts = row_attempts WHERE phone = in_phone;
    RETURN 'wrong';
  END IF;

  -- Single use. A code that still works after it has been used is a code that
  -- can be replayed from a screenshot.
  DELETE FROM login_codes WHERE phone = in_phone;
  RETURN 'ok';
END $$;--> statement-breakpoint

COMMENT ON FUNCTION app.verify_login_code(text, text, text, integer) IS
  'Verifies and consumes a one-time code in one locked statement. Sign-in role only. Returns ok | wrong | expired | too_many_attempts.';--> statement-breakpoint

-- =============================================================================
-- Sweeping
--
-- The issue path calls this, so the table stays bounded by the number of people
-- signing in rather than by the number who ever have. It is exposed separately
-- because an operator should be able to run it by hand, and because the day a
-- scheduler exists (DEBT_REGISTER #5) this is one line of configuration.
-- =============================================================================
CREATE OR REPLACE FUNCTION app.purge_expired_login_codes() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE removed bigint;
BEGIN
  IF NOT app.is_identity() THEN
    RAISE EXCEPTION 'purge_expired_login_codes is a sign-in operation';
  END IF;

  DELETE FROM login_codes WHERE expires_at <= now();
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END $$;
