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

describe('every table is reachable by someone', () => {
  it('has at least one policy', () => {
    // Forced RLS with no policy is a locked door with no key. It is SAFE, which
    // is why it survives review, and it fails in production as a query that
    // returns nothing with no error to explain why.
    const named = new Set(policies.map((p) => p.tablename));
    const unreachable = tables.filter((t) => !named.has(t));
    expect(unreachable).toEqual([]);
  });

  it('has a policy for reading, not only for writing', () => {
    const readable = new Set(
      policies.filter((p) => p.cmd === 'SELECT' || p.cmd === 'ALL').map((p) => p.tablename),
    );
    expect(tables.filter((t) => !readable.has(t))).toEqual([]);
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
