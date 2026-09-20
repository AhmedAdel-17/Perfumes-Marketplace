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
import { applyMigrations, migrationFiles } from './migrate';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ORDER_SOURCES, SUB_ORDER_STATES, TRANSITIONS,
  REJECTION_REASONS, CANCELLATION_REASONS, REFUSAL_REASONS, RETURN_REASONS,
  LISTING_STATES, MODERATION_REASONS,
  CONCENTRATIONS, PRODUCT_FORMS, GENDER_POSITIONINGS, SCENT_FAMILIES, SEASONS,
  DAY_NIGHT, OCCASIONS, PROJECTION_BANDS, LONGEVITY_BANDS, PERFORMANCE_SOURCES,
  RETURN_ELIGIBILITIES,
  DEFAULT_RATES, FixedClock, Money, SettlementService,
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
  await applyMigrations(db);
}, 120_000);

afterAll(async () => { await db?.close(); });

/** Named so the table above can loop, rather than repeating eleven near-identical cases. */
const CATALOGUE_VOCABULARIES = {
  CONCENTRATIONS, PRODUCT_FORMS, GENDER_POSITIONINGS, SCENT_FAMILIES, SEASONS,
  DAY_NIGHT, OCCASIONS, PROJECTION_BANDS, LONGEVITY_BANDS, PERFORMANCE_SOURCES,
  RETURN_ELIGIBILITIES,
} as const;

describe('controlled vocabularies exist identically on both sides', () => {
  it('sub-order states', async () => {
    expect((await enumValues('sub_order_state')).sort()).toEqual([...SUB_ORDER_STATES].sort());
  });

  it('order sources', async () => {
    expect((await enumValues('order_source')).sort()).toEqual([...ORDER_SOURCES].sort());
  });

  it('listing states', async () => {
    expect((await enumValues('product_status')).sort()).toEqual([...LISTING_STATES].sort());
  });

  it.each([
    ['concentration', 'CONCENTRATIONS'],
    ['product_form', 'PRODUCT_FORMS'],
    ['gender_positioning', 'GENDER_POSITIONINGS'],
    ['scent_family', 'SCENT_FAMILIES'],
    ['season', 'SEASONS'],
    ['day_night', 'DAY_NIGHT'],
    ['occasion', 'OCCASIONS'],
    ['projection_band', 'PROJECTION_BANDS'],
    ['longevity_band', 'LONGEVITY_BANDS'],
    ['performance_source', 'PERFORMANCE_SOURCES'],
    ['return_eligibility', 'RETURN_ELIGIBILITIES'],
  ] as const)('the catalogue vocabulary %s', async (dbEnum, constant) => {
    // Each of these exists as a Postgres enum, a Drizzle mirror, a domain
    // constant and a Zod schema. Three of the four are derived from the domain
    // one; this is what holds the fourth — the database — against it.
    const domain = CATALOGUE_VOCABULARIES[constant];
    expect((await enumValues(dbEnum)).sort()).toEqual([...domain].sort());
  });

  it('moderation reasons', async () => {
    // A reason the domain can send and the database cannot store is a takedown
    // that fails at the last statement — which is how the seller portal's
    // fourth decline button came to render and do nothing.
    expect((await enumValues('moderation_reason')).sort())
      .toEqual([...MODERATION_REASONS].sort());
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
      `INSERT INTO sellers (trading_name,owner_name,slug)
       VALUES ('t','o','parity-'||substr(gen_random_uuid()::text,1,8)) RETURNING id`)).rows[0]!.id;
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
          // The delivery details denormalised onto the sub-order by 0004 are
          // NOT NULL. This fixture predates them: it ran against a subset of
          // the migrations, and applying all of them is what surfaced the gap.
          `INSERT INTO sub_orders (order_id,seller_id,reference,merchandise_piastres,shipping_piastres,state,
             recipient_name,recipient_phone,governorate,city,area,street,building,
             delivery_fulfilled_by)
           VALUES ($1,$2,'P-'||substr(gen_random_uuid()::text,1,10),100,0,$3::sub_order_state,
             't','01001234567','cairo','c','a','s','1','seller')
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

describe('the payout formula, held identically in both layers', () => {
  it('the SQL CHECK and the domain agree that net = gross − commission', () => {
    // These disagreed. The domain computed `gross − commission − shipping`
    // while `payout_lines_net_reconciles` asserted `gross − commission`, and
    // the disagreement was invisible until a real payout was written and the
    // database refused the row. Every house would have been underpaid by the
    // delivery fee — a fee the customer had already paid to the marketplace.
    //
    // Two layers holding the same rule is defence in depth only while a test
    // proves they hold the SAME rule.
    // 0008 REPLACED the constraint, so the current rule is the last definition
    // across all migrations, not the one in 0001. Reading only the earliest
    // file would assert a rule the database stopped enforcing.
    //
    // EVERY migration, not a named pair. Naming them meant that the next
    // migration to touch this constraint would be invisible here — the test
    // would keep passing against a rule the database had already replaced,
    // which is the precise failure the file is meant to catch.
    const sql = migrationFiles()
      .map((f) => readFileSync(join(MIGRATIONS, f), 'utf8')).join(String.fromCharCode(10));
    const constraint = sql
      .replace(/\s+/g, ' ')
      .match(/payout_lines_net_reconciles\s+CHECK \(([^)]*)\)(?![\s\S]*payout_lines_net_reconciles\s+CHECK)/i);

    expect(constraint, 'the CHECK must still exist').not.toBeNull();
    const expression = constraint![1]!.replace(/\s+/g, ' ').trim();
    expect(expression).toBe(
      'net_piastres = gross_piastres - commission_piastres + shipping_piastres',
    );
  });

  it('a statement built by the domain satisfies the SQL CHECK, line by line', () => {
    const statement = new SettlementService(new FixedClock(new Date('2026-09-20T00:00:00Z'))).build({
      sellerId: 'seller-1',
      periodStart: new Date('2026-09-01T00:00:00Z'),
      periodEnd: new Date('2026-09-30T00:00:00Z'),
      subOrders: [
        {
          id: 'a', reference: 'DY-PARITY-A', state: 'delivered',
          merchandise: Money.fromMinor(100_000), shipping: Money.fromMinor(5_500),
          commissionSource: 'organic_search', commissionBps: 1500, deliveryFulfilledBy: 'seller',
          deliveredAt: new Date('2026-09-05T00:00:00Z'), cashInHand: true,
        },
        {
          id: 'b', reference: 'DY-PARITY-B', state: 'returned',
          merchandise: Money.fromMinor(38_000), shipping: Money.fromMinor(5_500),
          commissionSource: 'storefront_referral', commissionBps: 500, deliveryFulfilledBy: 'seller',
          deliveredAt: new Date('2026-09-06T00:00:00Z'), cashInHand: true,
        },
      ],
      adjustments: [],
      reserveDays: 7,
      disputeWindowDays: 7,
    });

    // Exactly what the database will evaluate on INSERT.
    for (const line of statement.lines) {
      expect(
        line.net.minor,
        `${line.reference} must satisfy net = gross - commission + shipping`,
      ).toBe(line.gross.minor - line.commission.minor + line.shipping.minor);
    }
  });
});
