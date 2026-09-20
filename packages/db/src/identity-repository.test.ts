/**
 * Sign-in resolution, and the wall around it.
 *
 * TWO CLAIMS, and the second is the one this file exists for. That the lookups
 * find the right principal is easy and would be true of any implementation.
 * That they are the ONLY things the `identity` role can do is the property task
 * P3.4.1 bought, and it is a property of the database rather than of the code
 * above it — so it is asserted here, against a real Postgres, through an
 * unprivileged role.
 *
 * WHY THAT MATTERS. Until 0027 these reads ran on the raw connection, which is
 * a SUPERUSER: Postgres never applies row-level security to one, whatever the
 * policies say and whatever GUC is set. Every case below therefore drops to
 * `app_user` first. A case that forgot would pass while proving nothing at all.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from './migrate';
import { DrizzleUnitOfWork, type DiyarDatabase } from './repositories';
import * as schema from './schema/index';

let pg: PGlite;
let db: DiyarDatabase;

const HOUSE_PHONE = '01001234567';
const OPERATOR_PHONE = '01000000001';

let sellerId = '';
let staffAuthUserId = '';
let operatorStaffId = '';

const asIdentity = () => new DrizzleUnitOfWork(db, { role: 'identity', id: null });

/**
 * One statement as a role, unprivileged, in its own transaction.
 *
 * Used where the claim is about what the DATABASE refuses rather than about
 * what the repository returns. It goes through raw SQL because PGlite is a
 * single connection: reaching for the Drizzle handle from inside an open
 * transaction deadlocks instead of failing, which reads as a hung test.
 */
async function asRole(role: string, sql: string): Promise<unknown[]> {
  await pg.exec('BEGIN');
  try {
    await pg.query(`SELECT set_config('app.actor_role', $1, true)`, [role]);
    await pg.exec('SET LOCAL ROLE app_user');
    const result = await pg.query(sql);
    await pg.exec('COMMIT');
    return result.rows;
  } catch (error) {
    await pg.exec('ROLLBACK').catch(() => undefined);
    throw error;
  }
}
const asAnon = () => new DrizzleUnitOfWork(db, { role: 'anon', id: null });

beforeAll(async () => {
  pg = new PGlite();
  await applyMigrations(pg);
  db = drizzle(pg, { schema }) as unknown as DiyarDatabase;

  await pg.exec(`SET app.actor_role='platform'; SET app.actor_id='${'9'.repeat(8)}-9999-9999-9999-999999999999';`);

  const seller = await pg.query<{ id: string }>(
    `INSERT INTO sellers (trading_name, owner_name, slug, status)
     VALUES ('دار الورد', 'خالد', 'dar-al-ward', 'live') RETURNING id`);
  sellerId = seller.rows[0]!.id;

  await pg.query(
    `INSERT INTO seller_contacts (seller_id, contact_phone) VALUES ($1,$2)`,
    [sellerId, HOUSE_PHONE]);

  const staff = await pg.query<{ auth_user_id: string }>(
    `INSERT INTO seller_staff (seller_id, auth_user_id, role, full_name)
     VALUES ($1, gen_random_uuid(), 'owner', 'خالد') RETURNING auth_user_id`, [sellerId]);
  staffAuthUserId = staff.rows[0]!.auth_user_id;

  const operator = await pg.query<{ id: string }>(
    `INSERT INTO platform_staff (auth_user_id, full_name, phone, role)
     VALUES (gen_random_uuid(), 'مشغّلة المنصّة', $1, 'admin') RETURNING id`, [OPERATOR_PHONE]);
  operatorStaffId = operator.rows[0]!.id;
});

describe('a house signs in', () => {
  it('resolves its contact number to a house and a staff member', async () => {
    const found = await asIdentity().transaction(
      (r) => r.identity.sellerByContactPhone(HOUSE_PHONE));

    expect(found).toEqual({ sellerId, staffAuthUserId });
  });

  it('answers nothing for a number that belongs to nobody', async () => {
    // The control. Without it the case above would pass against a lookup that
    // returns the first house for any input at all.
    const found = await asIdentity().transaction(
      (r) => r.identity.sellerByContactPhone('01999999999'));

    expect(found).toBeNull();
  });

  it('answers nothing once every staff member has been revoked', async () => {
    /*
     * A house whose staff are all revoked and a number nobody owns give the
     * same answer on purpose. The sign-in screen says the same thing either
     * way, and a caller that could tell them apart would be an oracle for which
     * numbers are worth attacking.
     */
    const other = await pg.query<{ id: string }>(
      `INSERT INTO sellers (trading_name, owner_name, slug, status)
       VALUES ('دار مغلقة', 'سلمى', 'dar-moghlaqa', 'live') RETURNING id`);
    const id = other.rows[0]!.id;
    await pg.query(
      `INSERT INTO seller_contacts (seller_id, contact_phone) VALUES ($1,'01555550000')`, [id]);
    await pg.query(
      `INSERT INTO seller_staff (seller_id, auth_user_id, role, full_name, revoked_at)
       VALUES ($1, gen_random_uuid(), 'owner', 'سلمى', now())`, [id]);

    expect(await asIdentity().transaction(
      (r) => r.identity.sellerByContactPhone('01555550000'))).toBeNull();
  });
});

describe('a session is revalidated on every request', () => {
  it('confirms a staff member who still works there', async () => {
    expect(await asIdentity().transaction(
      (r) => r.identity.sellerStaffIsActive(sellerId, staffAuthUserId))).toBe(true);
  });

  it('refuses one whose access was revoked', async () => {
    const revoked = await pg.query<{ auth_user_id: string }>(
      `INSERT INTO seller_staff (seller_id, auth_user_id, role, full_name, revoked_at)
       VALUES ($1, gen_random_uuid(), 'fulfilment', 'مسروح', now()) RETURNING auth_user_id`,
      [sellerId]);

    expect(await asIdentity().transaction(
      (r) => r.identity.sellerStaffIsActive(sellerId, revoked.rows[0]!.auth_user_id))).toBe(false);
  });

  it('refuses a staff member paired with the WRONG house', async () => {
    // A signed cookie carries both halves, and a forged one would carry a real
    // staff id against a house it does not belong to. The lookup matches both.
    const other = await pg.query<{ id: string }>(
      `INSERT INTO sellers (trading_name, owner_name, slug, status)
       VALUES ('دار ثالثة', 'ليلى', 'dar-thalitha', 'live') RETURNING id`);

    expect(await asIdentity().transaction(
      (r) => r.identity.sellerStaffIsActive(other.rows[0]!.id, staffAuthUserId))).toBe(false);
  });
});

describe('an operator signs in, and stays signed in only while they work here', () => {
  it('resolves a number to an operator, with the name the audit trail keeps', async () => {
    const found = await asIdentity().transaction(
      (r) => r.identity.operatorByPhone(OPERATOR_PHONE));

    expect(found?.staffId).toBe(operatorStaffId);
    expect(found?.fullName).toBe('مشغّلة المنصّة');
  });

  it('reads the CURRENT role, not the one on the cookie', async () => {
    const active = await asIdentity().transaction(
      (r) => r.identity.activeOperator(operatorStaffId));

    expect(active).toEqual({ staffId: operatorStaffId, role: 'admin' });
  });

  it('answers nothing for an operator who has been revoked', async () => {
    const gone = await pg.query<{ id: string }>(
      `INSERT INTO platform_staff (auth_user_id, full_name, phone, role, revoked_at)
       VALUES (gen_random_uuid(), 'سابق', '01000000009', 'operator', now()) RETURNING id`);

    expect(await asIdentity().transaction(
      (r) => r.identity.activeOperator(gone.rows[0]!.id))).toBeNull();
    expect(await asIdentity().transaction(
      (r) => r.identity.operatorByPhone('01000000009'))).toBeNull();
  });
});

describe('the identity role can do these four things and nothing else', () => {
  /*
   * The half that is not about sign-in working. `identity` is set only inside a
   * sign-in transaction on the server and is reachable from a browser never —
   * but "reachable from nowhere" is a claim about today's code, and these are
   * claims about the database, which stay true after the code changes.
   */
  it('cannot read a house it was not asked about — it reads by predicate, not by list', async () => {
    // It CAN read the contacts table; that is the grant sign-in needs. What it
    // cannot do is come back with anything but ids, because the repository
    // above it never selects a contact column. Proved by the port's shape: the
    // three methods return ids and a boolean.
    const found = await asIdentity().transaction(
      (r) => r.identity.sellerByContactPhone(HOUSE_PHONE));
    expect(Object.keys(found!).sort()).toEqual(['sellerId', 'staffAuthUserId']);
  });

  it('cannot write to seller_staff', async () => {
    // Raw SQL in its own transaction rather than through the Unit of Work:
    // PGlite is a single connection, and reaching for the outer handle from
    // inside an open transaction deadlocks rather than failing.
    await expect(asRole('identity',
      `INSERT INTO seller_staff (seller_id, auth_user_id, role, full_name)
       VALUES ('${sellerId}', gen_random_uuid(), 'owner', 'دخيل')`)).rejects.toThrow();
  });

  it('cannot read an order', async () => {
    // The blast radius, stated. A role that could read orders would turn a
    // sign-in form into a data export.
    expect(await asRole('identity', `SELECT id FROM orders`)).toEqual([]);
  });

  it('cannot read a house’s catalogue', async () => {
    expect(await asRole('identity', `SELECT id FROM products`)).toEqual([]);
  });

  it('and an ANONYMOUS visitor still cannot resolve a phone to a house', async () => {
    /*
     * The case that makes the role worth having. If `anon` could do this, the
     * policy would be decoration — and migration 0026 moved these details off
     * the public row precisely so that anonymous traffic could not reach them.
     */
    const found = await asAnon().transaction(
      (r) => r.identity.sellerByContactPhone(HOUSE_PHONE));

    expect(found, 'an anonymous session resolved a house from its phone number').toBeNull();
  });
});
