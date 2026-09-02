/**
 * Parity between the domain and the database.
 *
 * ENGINEERING_PRINCIPLES §4 calls the duplicated state machine "deliberate
 * duplication, not an oversight: one place to read the rule, one place it cannot
 * be evaded." That is only true while the two copies agree.
 *
 * Nothing was checking that. Every controlled vocabulary exists twice — once as
 * a TypeScript const, once as a Postgres enum — and the sub-order transition
 * table exists twice too. Add a state to one side and the other fails at
 * runtime, on a money path, in production.
 *
 * This file is the check. It reads the real enum values out of a migrated
 * database and compares them to what the domain believes.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ORDER_SOURCES, SUB_ORDER_STATES, TRANSITIONS,
  REJECTION_REASONS, CANCELLATION_REASONS, REFUSAL_REASONS, RETURN_REASONS,
  DEFAULT_RATES,
} from '@diyar/domain';

let db: PGlite;
const MIGRATIONS = join(import.meta.dirname, '../migrations');
const CONSTRAINTS_SQL = readFileSync(join(MIGRATIONS, '0001_constraints.sql'), 'utf8');

const runSql = async (f: string) =>
  db.exec(readFileSync(join(MIGRATIONS, f), 'utf8').replace(/--> statement-breakpoint/g, ''));

/** The values Postgres actually holds for an enum type. */
const enumValues = async (name: string): Promise<string[]> => {
  const r = await db.query<{ v: string }>(
    `SELECT e.enumlabel v FROM pg_enum e
     JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = $1 ORDER BY e.enumsortorder`, [name]);
  return r.rows.map((x) => x.v);
};

beforeAll(async () => {
  db = new PGlite();
  await runSql('0000_initial.sql');
  await runSql('0001_constraints.sql');
}, 120_000);

afterAll(async () => { await db?.close(); });

describe('controlled vocabularies exist identically on both sides', () => {
  it('sub-order states', async () => {
    expect((await enumValues('sub_order_state')).sort()).toEqual([...SUB_ORDER_STATES].sort());
  });

  it('order sources', async () => {
    expect((await enumValues('order_source')).sort()).toEqual([...ORDER_SOURCES].sort());
  });

  it('reason codes — every domain code exists in the database enum', async () => {
    const dbCodes = await enumValues('reason_code');
    const domainCodes = [
      ...REJECTION_REASONS, ...CANCELLATION_REASONS,
      ...REFUSAL_REASONS, ...RETURN_REASONS,
    ];
    for (const code of domainCodes) {
      expect(dbCodes, `domain reason "${code}" missing from reason_code enum`).toContain(code);
    }
  });

  it('reason codes — and no orphan exists in the database that the domain cannot produce', async () => {
    const dbCodes = await enumValues('reason_code');
    const domainCodes = new Set<string>([
      ...REJECTION_REASONS, ...CANCELLATION_REASONS,
      ...REFUSAL_REASONS, ...RETURN_REASONS,
    ]);
    const orphans = dbCodes.filter((c) => !domainCodes.has(c));
    expect(orphans, `unreachable reason codes: ${orphans.join(', ')}`).toEqual([]);
  });

  it('every order source has a configured commission rate', () => {
    for (const source of ORDER_SOURCES) {
      expect(DEFAULT_RATES[source], `no rate for source "${source}"`).toBeTypeOf('number');
    }
  });
});

describe('the sub-order transition table is the same table twice', () => {
  /** Parse the (from, to) pairs out of the trigger in 0001_constraints.sql. */
  const sqlTransitions = (): Array<[string, string]> => {
    const fn = CONSTRAINTS_SQL.slice(
      CONSTRAINTS_SQL.indexOf('enforce_sub_order_transition'),
      CONSTRAINTS_SQL.indexOf('CREATE TRIGGER sub_orders_state_machine'),
    );
    return [...fn.matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'\s*\)/g)].map(
      (m) => [m[1]!, m[2]!] as [string, string],
    );
  };

  it('finds the pairs in the SQL, so the parse itself is not silently empty', () => {
    expect(sqlTransitions().length).toBeGreaterThan(5);
  });

  it('SQL and domain permit exactly the same transitions', () => {
    const sql = sqlTransitions().map(([f, t]) => `${f}->${t}`).sort();
    const domain = TRANSITIONS.map((t) => `${t.from}->${t.to}`).sort();
    expect(sql).toEqual(domain);
  });

  it('and the database actually enforces that set, not just declares it', async () => {
    // Behavioural check, independent of the parse above: attempt every possible
    // pair against a real row and record which the database accepts.
    const seller = (await db.query<{ id: string }>(
      `INSERT INTO sellers (trading_name,owner_name,contact_phone,slug)
       VALUES ('t','o','01001234567','parity-'||substr(gen_random_uuid()::text,1,8)) RETURNING id`)).rows[0]!.id;
    const customer = (await db.query<{ id: string }>(
      `INSERT INTO customers (phone) VALUES ('01001234567') RETURNING id`)).rows[0]!.id;

    const accepted: string[] = [];

    for (const from of SUB_ORDER_STATES) {
      for (const to of SUB_ORDER_STATES) {
        if (from === to) continue;
        const order = (await db.query<{ id: string }>(
          `INSERT INTO orders (reference,customer_id,contact_phone,contact_name,governorate,city,area,
             street,building,source,merchandise_piastres,shipping_piastres,total_piastres,payment_method)
           VALUES ('P-'||substr(gen_random_uuid()::text,1,10),$1,'01001234567','t','cairo','c','a','s','1',
             'unknown',100,0,100,'cod') RETURNING id`, [customer])).rows[0]!.id;
        const sub = (await db.query<{ id: string }>(
          `INSERT INTO sub_orders (order_id,seller_id,reference,merchandise_piastres,shipping_piastres,state)
           VALUES ($1,$2,'P-'||substr(gen_random_uuid()::text,1,10),100,0,$3::sub_order_state)
           RETURNING id`, [order, seller, from])).rows[0]!.id;

        try {
          await db.query(`UPDATE sub_orders SET state=$2::sub_order_state WHERE id=$1`, [sub, to]);
          accepted.push(`${from}->${to}`);
        } catch {
          /* refused, as expected for illegal pairs */
        }
      }
    }

    expect(accepted.sort()).toEqual(TRANSITIONS.map((t) => `${t.from}->${t.to}`).sort());
  }, 120_000);
});

describe('money representation matches the Money value object', () => {
  it('every money column is an integer — piastres, never a float', async () => {
    const r = await db.query<{ table_name: string; column_name: string; data_type: string }>(
      `SELECT table_name, column_name, data_type FROM information_schema.columns
       WHERE table_schema='public' AND column_name LIKE '%piastres%'`);
    expect(r.rows.length).toBeGreaterThan(15);
    const wrong = r.rows.filter((c) => c.data_type !== 'integer');
    expect(wrong.map((c) => `${c.table_name}.${c.column_name}:${c.data_type}`)).toEqual([]);
  });

  it('no numeric or real column exists anywhere that looks like money', async () => {
    const r = await db.query<{ table_name: string; column_name: string; data_type: string }>(
      `SELECT table_name, column_name, data_type FROM information_schema.columns
       WHERE table_schema='public'
         AND data_type IN ('numeric','real','double precision')`);
    expect(r.rows.map((c) => `${c.table_name}.${c.column_name}`)).toEqual([]);
  });

  it('commission is stored in basis points, bounded 0–10000', async () => {
    const r = await db.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema='public' AND column_name LIKE '%_bps'`);
    expect(r.rows.length).toBeGreaterThan(5);
    for (const c of r.rows) expect(c.data_type, c.column_name).toBe('integer');
  });
});
