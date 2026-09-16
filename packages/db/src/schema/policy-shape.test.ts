/**
 * The SHAPE of the policy set, as distinct from what any one policy does.
 *
 * `rls.test.ts` proves specific reads are refused. These prove properties that
 * hold across every table, present and future — the class of mistake that
 * arrives with the next migration rather than this one:
 *
 *   · a table with RLS forced and no policy at all, which denies everyone
 *     including the application, and fails as a runtime 500 far from the cause;
 *   · a policy written `USING (true)`, which is RLS in name only and reads as
 *     protection in every review and every audit;
 *   · a table holding personal data or money with no policy naming an actor.
 *
 * A per-table test cannot catch these, because the table that will be wrong is
 * the one nobody has written a test for yet.
 */
import { PGlite } from '@electric-sql/pglite';
import { applyMigrations } from '../migrate';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

let db: PGlite;
const MIGRATIONS = join(import.meta.dirname, '../../migrations');

interface Policy {
  tablename: string;
  policyname: string;
  cmd: string;
  qual: string | null;
  with_check: string | null;
}

let tables: string[] = [];
let policies: Policy[] = [];

beforeAll(async () => {
  db = new PGlite();
  await applyMigrations(db);

  tables = (await db.query<{ relname: string }>(
    `SELECT relname FROM pg_class
      WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
        AND relname <> 'schema_migrations'
      ORDER BY relname`)).rows.map((r) => r.relname);

  policies = (await db.query<Policy>(
    `SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies
      WHERE schemaname = 'public'`)).rows;
});

describe('the catalogue this file reasons over', () => {
  /**
   * Every other test here filters a list and expects the result to be empty.
   * If either query came back empty — a renamed schema, a migration that did
   * not run, a PGlite that started clean — every one of them would pass while
   * proving nothing at all. So the inputs are asserted first.
   */
  it('found the tables and the policies', () => {
    expect(tables.length).toBeGreaterThan(25);
    expect(policies.length).toBeGreaterThan(25);
  });
});

describe('the migration ledger is not an application table', () => {
  /*
   * `schema_migrations` is excluded from every rule in this file, and the
   * exclusion carries its own proof rather than being a name on a list.
   *
   * It is written by whoever runs migrations, connected as the owner. No
   * request touches it, so it has no policy — and the reason that is safe is
   * that the application role cannot reach it at all. That is what is asserted
   * here. If a future grant opened it up, this fails and the exemption above
   * stops being justified.
   */
  it('grants the application role nothing on it', async () => {
    const r = await db.query<{ n: number }>(
      `SELECT count(*)::int n FROM information_schema.role_table_grants
        WHERE table_name = 'schema_migrations' AND grantee = 'app_user'`);
    expect(r.rows[0]!.n).toBe(0);
  });

  it('has row-level security enabled', async () => {
    const r = await db.query<{ relrowsecurity: boolean }>(
      `SELECT relrowsecurity FROM pg_class
        WHERE relname = 'schema_migrations' AND relnamespace = 'public'::regnamespace`);
    expect(r.rows[0]?.relrowsecurity).toBe(true);
  });
});

describe('one-time codes are deliberately unreadable', () => {
  /*
   * `login_codes` (0025) is exempt from the readability rule below, and like
   * the ledger's exemption this one carries its own proof rather than being a
   * name on a list.
   *
   * It holds credentials. Nothing may read a pending code — not a visitor, not
   * an operator, not the sign-in path that wrote it — because a path that can
   * read one can enumerate them all. It is not merely unreadable: with RLS
   * forced and NO policies, direct SQL reaches nothing at all, and all three
   * operations are guarded `SECURITY DEFINER` functions instead.
   *
   * That was not the first design. Policies plus plain SQL was, and the
   * database refused it: with no SELECT policy, `INSERT … ON CONFLICT DO
   * UPDATE` cannot read the row it would update, and UPDATE and DELETE match
   * nothing because they cannot find rows either. Adding a SELECT policy would
   * have made all three work and handed the sign-in path the ability to read
   * every pending code in the system. The mechanism moved; the guarantee did
   * not.
   *
   * Three things have to hold for the exemption to be safe, and all three are
   * asserted here. If a future migration adds a policy, drops SECURITY DEFINER,
   * or removes a role guard, one of these fails and the exemption stops being
   * justified — which is the whole difference between an invariant and a
   * formality.
   */
  it('has no policies at all — the property the exemption rests on', () => {
    const own = policies.filter((p) => p.tablename === 'login_codes');
    expect(own).toEqual([]);
  });

  it('is nevertheless reachable, through SECURITY DEFINER functions', async () => {
    // A definer runs as the owner and bypasses RLS, which is what makes a table
    // with no policies usable at all. Without this the exemption above would
    // describe a locked door with no key.
    const r = await db.query<{ proname: string; prosecdef: boolean }>(
      `SELECT proname, prosecdef FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'app'
          AND p.proname IN ('issue_login_code', 'verify_login_code', 'purge_expired_login_codes')
        ORDER BY proname`);

    expect(r.rows.map((row) => row.proname)).toEqual([
      'issue_login_code', 'purge_expired_login_codes', 'verify_login_code',
    ]);
    expect(r.rows.every((row) => row.prosecdef)).toBe(true);
  });

  it('and every one of them refuses anyone who is not signing in', async () => {
    /*
     * The guard is what stops the definer's privilege being a hole: EXECUTE is
     * granted to PUBLIC by default and every actor connects as the same
     * database role, so without this check any caller could issue, verify — or,
     * worse, brute-force — codes. All three are checked, because a guard
     * missing from one of them is exactly the one nobody would think to test.
     */
    await db.exec(`SET app.actor_role='platform';`);

    await expect(
      db.query(`SELECT app.issue_login_code('01000000000','seller',$1,300)`, ['a'.repeat(64)]),
    ).rejects.toThrow(/sign-in operation/);
    await expect(
      db.query(`SELECT app.verify_login_code('01000000000','seller',$1,5)`, ['a'.repeat(64)]),
    ).rejects.toThrow(/sign-in operation/);
    await expect(
      db.query('SELECT app.purge_expired_login_codes()'),
    ).rejects.toThrow(/sign-in operation/);

    await db.exec(`RESET app.actor_role;`);
  });
});

describe('every table is reachable by someone', () => {
  /**
   * Tables reached ONLY through guarded `SECURITY DEFINER` functions, and
   * therefore exempt from both rules below. Each name here must be justified by
   * its own describe block above, which asserts the mechanism that replaces the
   * policies — never a bare entry.
   */
  const REACHED_ONLY_BY_FUNCTION = new Set<string>(['login_codes']);

  it('has at least one policy', () => {
    // Forced RLS with no policy is a locked door with no key. It is SAFE, which
    // is why it survives review, and it fails in production as a query that
    // returns nothing with no error to explain why. The exception is a table
    // where the lock is the design and the key is a function.
    const named = new Set(policies.map((p) => p.tablename));
    const unreachable = tables.filter((t) => !named.has(t) && !REACHED_ONLY_BY_FUNCTION.has(t));
    expect(unreachable).toEqual([]);
  });

  it('has a policy for reading, not only for writing', () => {
    const readable = new Set(
      policies.filter((p) => p.cmd === 'SELECT' || p.cmd === 'ALL').map((p) => p.tablename),
    );
    expect(tables.filter((t) => !readable.has(t) && !REACHED_ONLY_BY_FUNCTION.has(t))).toEqual([]);
  });

  it('and the exemption list names nothing that does not exist', () => {
    // An exemption for a table that has been renamed or dropped is an exemption
    // nobody notices is stale, silently widening the rule it was carved out of.
    for (const name of REACHED_ONLY_BY_FUNCTION) expect(tables).toContain(name);
  });
});

describe('no policy is protection in name only', () => {
  /**
   * `USING (true)` admits everyone. It is legitimate for genuinely public
   * reads, so the rule is not "never" — it is that each one is named here, with
   * the reason it is public, and a new one has to be added deliberately.
   */
  const PUBLIC_BY_DESIGN = new Set<string>([
    // The shopfront. Published products, their houses, brands and media are
    // meant to be readable by anyone, signed in or not — that is the catalogue.
    'products', 'sellers', 'brands', 'product_media', 'reviews',

    // The published rate card, identical for every house and versioned. Any
    // deviation negotiated with a particular house lives in
    // `commission_overrides`, which IS restricted to that house's own rows — so
    // opening this one discloses the standard terms, not anyone's deal.
    //
    // Considered and accepted: the row also carries `approved_by`, the internal
    // names that signed the version off. A rate card that says who approved it
    // is governance rather than leakage, and the houses are party to these
    // terms. Recorded here so it stays a decision.
    'commission_rule_sets',

    // Which product opens the homepage, and which lead the grid. There is
    // nothing here that is not already visible the moment anybody loads the
    // site — the row IS the homepage's arrangement, and the homepage is public.
    // Note what is deliberately NOT public alongside it: `announcements` has
    // its own window predicate, because a SCHEDULED notice is a plan, and
    // "free delivery from Sunday" readable on Thursday is a discount announced
    // three days early to whoever happened to be looking.
    'site_curation',
  ]);

  it('admits everyone only where the data is genuinely public', () => {
    const open = policies
      .filter((p) => (p.qual ?? '').trim() === 'true' && !PUBLIC_BY_DESIGN.has(p.tablename))
      .map((p) => `${p.tablename}.${p.policyname}`);
    expect(open).toEqual([]);
  });

  it('and even those restrict what can be WRITTEN', () => {
    // A public read is one thing; a public write is another. Every policy that
    // permits INSERT or UPDATE must qualify who may do it.
    const openWrites = policies
      .filter((p) => ['INSERT', 'UPDATE', 'ALL'].includes(p.cmd))
      .filter((p) => (p.with_check ?? '').trim() === 'true' && (p.qual ?? '').trim() === 'true')
      .map((p) => `${p.tablename}.${p.policyname} (${p.cmd})`);
    expect(openWrites).toEqual([]);
  });
});

describe('the tables that hold money and people', () => {
  /**
   * Named individually because these are the ones where a missing policy costs
   * something irreversible: a house seeing another house's settlement, or a
   * customer's address reaching anyone who asks.
   */
  const SENSITIVE = [
    'customers', 'customer_addresses', 'orders', 'order_line_items', 'sub_orders',
    'payouts', 'payout_lines', 'adjustments', 'shipments', 'shipment_events',
    'returns', 'support_tickets', 'consent_records', 'privacy_requests',
    'seller_verifications', 'platform_staff', 'seller_staff', 'audit_log',
    'commission_overrides', 'sub_order_transitions',
  ];

  it.each(SENSITIVE)('%s decides by actor, never by a blanket allow', (table) => {
    const own = policies.filter((p) => p.tablename === table);
    expect(own.length, `${table} has no policy at all`).toBeGreaterThan(0);

    for (const p of own) {
      const clause = `${p.qual ?? ''} ${p.with_check ?? ''}`;
      expect(
        /app\.|current_setting|actor|seller_id|customer_id|auth_user_id/.test(clause),
        `${table}.${p.policyname} (${p.cmd}) admits without naming an actor: ${clause.trim()}`,
      ).toBe(true);
    }
  });
});
