-- =============================================================================
-- 0007 — Platform staff
--
-- Operations needs to mark orders delivered, record that a courier remitted
-- cash, and run payouts. Those are already platform-only procedures; what did
-- not exist was any way to BE platform staff. The role was enforced everywhere
-- and granted nowhere.
--
-- WHY A TABLE RATHER THAN AN ENVIRONMENT VARIABLE. An allowlist of phone
-- numbers in config is the fast version, and it is wrong for this specific
-- surface: these people move money. Doc 04 §1 requires role-based access, and
-- doc 06 §11 requires that operational actions be attributable to a named
-- person. A config value has no revocation, no audit trail, and no answer to
-- "who marked this delivered" — and `audit_log.actor_id` is NOT NULL for
-- exactly that reason.
--
-- `revoked_at` rather than DELETE, so someone who has left keeps their history
-- while losing their access. The seller-staff table makes the same choice for
-- the same reason.
-- =============================================================================

CREATE TABLE platform_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL,
  full_name text NOT NULL,
  phone text NOT NULL,
  -- Deliberately coarse for now. A finer split (who may run payouts versus who
  -- may only mark deliveries) is a real requirement, and inventing the
  -- permission matrix before anyone has done the job would be guessing.
  role text NOT NULL DEFAULT 'operator',
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT platform_staff_phone_shape
    CHECK (phone ~ '^(\+20|0)1[0125][0-9]{8}$'),
  CONSTRAINT platform_staff_role_known
    CHECK (role IN ('operator', 'admin'))
);

CREATE UNIQUE INDEX platform_staff_auth_user_key ON platform_staff (auth_user_id);
-- Partial: a revoked person's number can be reissued to their replacement, but
-- two ACTIVE staff may never share one, or sign-in cannot say who is signing in.
CREATE UNIQUE INDEX platform_staff_active_phone_key
  ON platform_staff (phone) WHERE revoked_at IS NULL;

ALTER TABLE platform_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_staff FORCE ROW LEVEL SECURITY;

-- Platform only, in both directions. A seller must not be able to enumerate who
-- operates the marketplace, and a customer has no business here at all.
CREATE POLICY platform_manage_staff ON platform_staff
  FOR ALL USING (app.is_platform()) WITH CHECK (app.is_platform());

GRANT SELECT, INSERT, UPDATE, DELETE ON platform_staff TO app_user;

/**
 * Resolve the signed-in operator, if any.
 *
 * SECURITY DEFINER so the lookup itself is not subject to the policy above —
 * otherwise establishing who you are would require already being known, which
 * is a circular check that silently answers "nobody".
 */
CREATE OR REPLACE FUNCTION app.platform_staff_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM platform_staff
  WHERE auth_user_id = app.actor_id() AND revoked_at IS NULL
  LIMIT 1
$$;
