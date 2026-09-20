/**
 * A house's contact details are unreachable from a public read path.
 *
 * INVERTED 20 September 2026 (task P1.4.6). This file used to be a STATIC
 * check: it walked the source, matched `sellers.contact_phone` and friends, and
 * failed when a new read appeared outside a small allow-list. That guard was
 * real and it was the wrong shape. It protected those columns from THIS
 * repository's queries and from nothing else — anyone holding an `anon` session
 * could ask Postgres directly, because `public_read_live_sellers` admits every
 * actor to the whole row of any live house and Postgres has no column-level row
 * security to hold two of its columns back.
 *
 * Migration 0026 moved the columns to `seller_contacts`, a table with no public
 * policy at all. So the question this file asks changes from "does any of our
 * code select these columns" to "can an anonymous session reach them" — and
 * that one is answered by the database rather than by a convention, which means
 * it is answered the same way for a query nobody has written yet.
 *
 * EVERY CASE RUNS AS `app_user`. Postgres never applies row-level security to a
 * superuser, and the connection these tests open is one, so a case that forgot
 * to drop the role would pass while proving nothing whatsoever.
 */
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from './migrate';

let db: PGlite;

const HOUSE_PHONE = '01001234567';
const HOUSE_EMAIL = 'house@example.com';
let liveSellerId = '';
let staffAuthUserId = '';

/**
 * Run one statement as an actor, unprivileged.
 *
 * `SET LOCAL ROLE app_user` inside a transaction, in the same order
 * `DrizzleUnitOfWork` uses: set the actor while still privileged, then drop the
 * role. A refused write aborts the transaction, so the rollback is what returns
 * the session to normal.
 */
async function asActor<T = Record<string, unknown>>(
  role: string,
  actorId: string | null,
  sql: string,
): Promise<T[]> {
  await db.exec('BEGIN');
  try {
    await db.query(`SELECT set_config('app.actor_role', $1, true)`, [role]);
    await db.query(`SELECT set_config('app.actor_id', $1, true)`, [actorId ?? '']);
    await db.exec('SET LOCAL ROLE app_user');
    const result = await db.query<T>(sql);
    await db.exec('COMMIT');
    return result.rows;
  } catch (error) {
    await db.exec('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

beforeAll(async () => {
  db = new PGlite();
  await applyMigrations(db);

  const seller = await db.query<{ id: string }>(
    `INSERT INTO sellers (trading_name, owner_name, slug, city, status)
     VALUES ('دار الورد', 'ورد', 'dar-al-ward', 'القاهرة', 'live') RETURNING id`);
  liveSellerId = seller.rows[0]!.id;

  await db.query(
    `INSERT INTO seller_contacts (seller_id, contact_phone, contact_email) VALUES ($1,$2,$3)`,
    [liveSellerId, HOUSE_PHONE, HOUSE_EMAIL]);

  const staff = await db.query<{ auth_user_id: string }>(
    `INSERT INTO seller_staff (seller_id, auth_user_id, role, full_name)
     VALUES ($1, gen_random_uuid(), 'owner', 'ورد') RETURNING auth_user_id`,
    [liveSellerId]);
  staffAuthUserId = staff.rows[0]!.auth_user_id;
});

describe('the inputs these cases reason over', () => {
  /*
   * Every case below expects an EMPTY result. If the fixture had failed to
   * insert, or the role never dropped, they would all pass while proving
   * nothing. So the instrument is checked first.
   */
  it('a live house exists, with contact details attached', async () => {
    const rows = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM seller_contacts WHERE seller_id = '${liveSellerId}'`);
    expect(rows.rows[0]!.n).toBe(1);
  });

  it('and an anonymous session can still read the house itself', async () => {
    // The control. Anonymous traffic MUST reach a live house — it is the
    // catalogue and the SEO surface. A refusal here would mean the cases below
    // prove only that the fixture is invisible.
    const rows = await asActor('anon', null,
      `SELECT trading_name FROM sellers WHERE id = '${liveSellerId}'`);
    expect(rows).toHaveLength(1);
  });
});

describe('an anonymous session cannot reach a house’s contact details', () => {
  it('reads no rows from seller_contacts at all', async () => {
    const rows = await asActor('anon', null, `SELECT * FROM seller_contacts`);
    expect(rows, 'anonymous traffic read a house’s private contact row').toEqual([]);
  });

  it('cannot find a house by its phone number', async () => {
    // The scraping shape, and the one the debt named: harvest every pilot
    // house's mobile number in one query through the ordinary catalogue path.
    const rows = await asActor('anon', null,
      `SELECT seller_id FROM seller_contacts WHERE contact_phone = '${HOUSE_PHONE}'`);
    expect(rows).toEqual([]);
  });

  it('cannot reach them by joining from the public seller row', async () => {
    // The row it is allowed to read is not a route to the row it is not.
    const rows = await asActor('anon', null,
      `SELECT c.contact_phone FROM sellers s
        JOIN seller_contacts c ON c.seller_id = s.id
        WHERE s.status = 'live'`);
    expect(rows).toEqual([]);
  });

  it('and the columns are no longer on the public row to be selected', async () => {
    // Belt and braces: even a query written in ignorance of 0026 cannot ask
    // for them, because asking is now a syntax error rather than a disclosure.
    const columns = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'sellers' AND column_name IN ('contact_phone','contact_email')`);
    expect(columns.rows).toEqual([]);
  });
});

describe('the parties that are supposed to reach them, still do', () => {
  it('an operator reads any house’s details', async () => {
    const rows = await asActor<{ contact_phone: string }>('platform', null,
      `SELECT contact_phone FROM seller_contacts WHERE seller_id = '${liveSellerId}'`);
    expect(rows.map((r) => r.contact_phone)).toEqual([HOUSE_PHONE]);
  });

  it('a house reads its own', async () => {
    const rows = await asActor<{ contact_email: string }>('seller', staffAuthUserId,
      `SELECT contact_email FROM seller_contacts WHERE seller_id = '${liveSellerId}'`);
    expect(rows.map((r) => r.contact_email)).toEqual([HOUSE_EMAIL]);
  });

  it('and a DIFFERENT house reads nothing', async () => {
    // The policy is keyed on the staff member's own house, so this is the case
    // that separates "a house can read contacts" from "a house can read ITS
    // contacts". Without it the seller policy could be `USING (true)`.
    const other = await db.query<{ id: string }>(
      `INSERT INTO sellers (trading_name, owner_name, slug, status)
       VALUES ('دار أخرى', 'ليلى', 'dar-okhra', 'live') RETURNING id`);
    const otherStaff = await db.query<{ auth_user_id: string }>(
      `INSERT INTO seller_staff (seller_id, auth_user_id, role, full_name)
       VALUES ($1, gen_random_uuid(), 'owner', 'ليلى') RETURNING auth_user_id`,
      [other.rows[0]!.id]);

    const rows = await asActor('seller', otherStaff.rows[0]!.auth_user_id,
      `SELECT contact_phone FROM seller_contacts WHERE seller_id = '${liveSellerId}'`);
    expect(rows, 'a house read a competitor’s contact details').toEqual([]);
  });
});

describe('sign-in still resolves a phone to a house', () => {
  /*
   * The exact join `features/seller/actions.ts` performs, against the real
   * schema. It is here rather than beside that file because `apps/web` has no
   * unit-test runner — only typecheck, e2e and audit — so without this the only
   * proof that moving the column did not break sign-in would be a browser run.
   *
   * It reads through the PRIVILEGED connection on purpose, because that is what
   * the sign-in path does: `database()` never drops to `app_user`, so RLS does
   * not apply to it. That is DEBT #14 and P3.4.1's to fix; this test records the
   * dependency rather than pretending it is not there, and it will need
   * revisiting on the day that task lands.
   */
  it('finds the house behind a phone number, through the new table', async () => {
    const rows = await db.query<{ seller_id: string }>(
      `SELECT ss.seller_id
         FROM seller_staff ss
         JOIN seller_contacts c ON c.seller_id = ss.seller_id
        WHERE c.contact_phone = $1 AND ss.revoked_at IS NULL
        LIMIT 1`, [HOUSE_PHONE]);

    expect(rows.rows.map((r) => r.seller_id)).toEqual([liveSellerId]);
  });

  it('and finds nobody behind a number that belongs to no house', async () => {
    // The control. Without it the case above would pass against a query that
    // returns the first house for any input at all.
    const rows = await db.query(
      `SELECT ss.seller_id
         FROM seller_staff ss
         JOIN seller_contacts c ON c.seller_id = ss.seller_id
        WHERE c.contact_phone = $1 AND ss.revoked_at IS NULL`, ['01999999999']);

    expect(rows.rows).toEqual([]);
  });
});

describe('the intake role may create a contact row and never read one', () => {
  it('writes the row for a house that is still applying', async () => {
    const applicant = await db.query<{ id: string }>(
      `INSERT INTO sellers (trading_name, owner_name, slug, status)
       VALUES ('دار تتقدّم', 'سلمى', 'dar-tataqaddam', 'applied') RETURNING id`);
    const id = applicant.rows[0]!.id;

    await asActor('intake', null,
      `INSERT INTO seller_contacts (seller_id, contact_phone)
       VALUES ('${id}', '01009876543')`);

    const written = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM seller_contacts WHERE seller_id = '${id}'`);
    expect(written.rows[0]!.n).toBe(1);
  });

  it('and cannot read back what it wrote', async () => {
    // An application form needs to WRITE a phone number. Nothing about it needs
    // to read one, and a role that can read this table is a role that can
    // enumerate it.
    const rows = await asActor('intake', null, `SELECT * FROM seller_contacts`);
    expect(rows).toEqual([]);
  });

  it('and cannot attach contacts to a house that is already trading', async () => {
    /*
     * The WITH CHECK is scoped to `applied`, the same restriction 0018 put on
     * the seller row. Without it the public application form would be a way to
     * put your own number on a trading house.
     *
     * The target is a live house with NO contact row, created here for the
     * purpose. Aiming at `liveSellerId` would have proved nothing: `seller_id`
     * is the primary key, so that insert is refused by the unique constraint
     * whatever the policy says, and the case would pass with the policy
     * deleted.
     */
    const trading = await db.query<{ id: string }>(
      `INSERT INTO sellers (trading_name, owner_name, slug, status)
       VALUES ('دار بلا تواصل', 'هدى', 'dar-bila-tawasul', 'live') RETURNING id`);
    const id = trading.rows[0]!.id;

    await expect(asActor('intake', null,
      `INSERT INTO seller_contacts (seller_id, contact_phone)
       VALUES ('${id}', '01111111111')`)).rejects.toThrow();

    // And nothing was written, which is the claim the rejection stands for.
    const after = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM seller_contacts WHERE seller_id = '${id}'`);
    expect(after.rows[0]!.n).toBe(0);
  });
});
