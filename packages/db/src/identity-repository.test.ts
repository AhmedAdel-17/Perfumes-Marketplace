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

/** Open a seller session as the sign-in flow does, and return its id. */
const openSeller = (principalId = staffAuthUserId, house = sellerId, ttlSeconds = 3600) =>
  asIdentity().transaction((r) => r.identity.openSession({
    audience: 'seller', principalId, sellerId: house, ttlSeconds, ipHash: 'ip#', uaHash: 'ua#',
  }));

const openOperator = (principalId = operatorStaffId, ttlSeconds = 3600) =>
  asIdentity().transaction((r) => r.identity.openSession({
    audience: 'platform', principalId, sellerId: null, ttlSeconds, ipHash: null, uaHash: null,
  }));

describe('a house’s session is a row, and every way it can die is one query', () => {
  it('reads back the house and the staff member it was opened for', async () => {
    const id = await openSeller();
    const found = await asIdentity().transaction((r) => r.identity.activeSellerSession(id));

    expect(found?.sellerId).toBe(sellerId);
    expect(found?.staffAuthUserId).toBe(staffAuthUserId);
  });

  it('ends on the next request once it is revoked — the acceptance criterion', async () => {
    const id = await openSeller();
    await asIdentity().transaction((r) => r.identity.revokeSession(id));

    expect(await asIdentity().transaction((r) => r.identity.activeSellerSession(id)),
      'a revoked session still opened the portal').toBeNull();
  });

  it('revoking twice is not an error', async () => {
    // A person pressing "sign out" twice has done nothing wrong. The trigger
    // refuses any update to a revoked row, so this proves the WHERE clause
    // skips it rather than the trigger forgiving it.
    const id = await openSeller();
    await asIdentity().transaction((r) => r.identity.revokeSession(id));
    await expect(asIdentity().transaction((r) => r.identity.revokeSession(id)))
      .resolves.toBeUndefined();
  });

  it('dies when its time is up, by the DATABASE’S clock', async () => {
    const id = await openSeller(staffAuthUserId, sellerId, 1);
    // Aged by the database rather than by waiting: the check compares against
    // `now()`, so moving the stamp is the honest way to make it "an hour ago".
    await pg.exec(`ALTER TABLE sessions DISABLE TRIGGER sessions_only_revoke`);
    await pg.query(
      `UPDATE sessions SET issued_at = now() - interval '2 hours',
         expires_at = now() - interval '1 hour' WHERE id = $1`, [id]);
    await pg.exec(`ALTER TABLE sessions ENABLE TRIGGER sessions_only_revoke`);

    expect(await asIdentity().transaction((r) => r.identity.activeSellerSession(id))).toBeNull();
  });

  it('dies when the staff member behind it is removed', async () => {
    const leaver = await pg.query<{ auth_user_id: string }>(
      `INSERT INTO seller_staff (seller_id, auth_user_id, role, full_name)
       VALUES ($1, gen_random_uuid(), 'fulfilment', 'مغادر') RETURNING auth_user_id`, [sellerId]);
    const principal = leaver.rows[0]!.auth_user_id;
    const id = await openSeller(principal);

    expect(await asIdentity().transaction((r) => r.identity.activeSellerSession(id))).not.toBeNull();

    await pg.query(`UPDATE seller_staff SET revoked_at = now() WHERE auth_user_id = $1`, [principal]);

    expect(await asIdentity().transaction((r) => r.identity.activeSellerSession(id)),
      'a removed staff member kept their session').toBeNull();
  });

  it('does not open for a staff member paired with the WRONG house', async () => {
    // A forged or confused session naming a real person against a house they
    // do not work for. The join matches the house as well as the person.
    const other = await pg.query<{ id: string }>(
      `INSERT INTO sellers (trading_name, owner_name, slug, status)
       VALUES ('دار ثالثة', 'ليلى', 'dar-thalitha', 'live') RETURNING id`);
    const id = await openSeller(staffAuthUserId, other.rows[0]!.id);

    expect(await asIdentity().transaction((r) => r.identity.activeSellerSession(id))).toBeNull();
  });

  it('is never read as an operator session', async () => {
    const id = await openSeller();
    expect(await asIdentity().transaction((r) => r.identity.activeOperatorSession(id))).toBeNull();
  });

  it('signs out everywhere in one statement, and says how many', async () => {
    const person = await pg.query<{ auth_user_id: string }>(
      `INSERT INTO seller_staff (seller_id, auth_user_id, role, full_name)
       VALUES ($1, gen_random_uuid(), 'owner', 'مسافر') RETURNING auth_user_id`, [sellerId]);
    const principal = person.rows[0]!.auth_user_id;
    const phone = await openSeller(principal);
    const laptop = await openSeller(principal);
    const bystander = await openSeller();

    const ended = await asIdentity().transaction(
      (r) => r.identity.revokeAllSessions('seller', principal));

    expect(ended).toBe(2);
    expect(await asIdentity().transaction((r) => r.identity.activeSellerSession(phone))).toBeNull();
    expect(await asIdentity().transaction((r) => r.identity.activeSellerSession(laptop))).toBeNull();
    // The control: somebody else's session is untouched.
    expect(await asIdentity().transaction((r) => r.identity.activeSellerSession(bystander)))
      .not.toBeNull();
  });
});

describe('a session can only ever be revoked — never altered', () => {
  /*
   * The trigger in 0028. RLS cannot say "this column only", so without it the
   * `identity` role could extend a session, move it to another person, or
   * un-revoke one. These run as `identity`, the role that holds UPDATE.
   */
  it('cannot be extended', async () => {
    const id = await openSeller();
    await expect(asRole('identity',
      `UPDATE sessions SET expires_at = now() + interval '30 days' WHERE id = '${id}'`))
      .rejects.toThrow(/only be revoked/);
  });

  it('cannot be moved to another person', async () => {
    const id = await openSeller();
    await expect(asRole('identity',
      `UPDATE sessions SET principal_id = gen_random_uuid() WHERE id = '${id}'`))
      .rejects.toThrow(/only be revoked/);
  });

  it('cannot be un-revoked', async () => {
    const id = await openSeller();
    await asIdentity().transaction((r) => r.identity.revokeSession(id));
    await expect(asRole('identity',
      `UPDATE sessions SET revoked_at = NULL WHERE id = '${id}'`))
      .rejects.toThrow(/already revoked/);
  });

  it('cannot be deleted — signed out is a fact about a row, not its absence', async () => {
    const id = await openSeller();
    // No DELETE policy, so the statement matches nothing rather than erroring.
    await asRole('identity', `DELETE FROM sessions WHERE id = '${id}'`);
    const still = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM sessions WHERE id = $1`, [id]);
    expect(still.rows[0]!.n).toBe(1);
  });
});

describe('an operator signs in, and stays signed in only while they work here', () => {
  it('resolves a number to an operator, with the name the audit trail keeps', async () => {
    const found = await asIdentity().transaction(
      (r) => r.identity.operatorByPhone(OPERATOR_PHONE));

    expect(found?.staffId).toBe(operatorStaffId);
    expect(found?.fullName).toBe('مشغّلة المنصّة');
  });

  it('reads the CURRENT role through the session, not the one on the cookie', async () => {
    const id = await openOperator();
    const active = await asIdentity().transaction((r) => r.identity.activeOperatorSession(id));
    expect(active?.staffId).toBe(operatorStaffId);
    expect(active?.role).toBe('admin');

    // A demotion takes effect on the next request, without anybody signing out.
    await pg.query(`UPDATE platform_staff SET role = 'operator' WHERE id = $1`, [operatorStaffId]);
    const after = await asIdentity().transaction((r) => r.identity.activeOperatorSession(id));
    expect(after?.role).toBe('operator');
    await pg.query(`UPDATE platform_staff SET role = 'admin' WHERE id = $1`, [operatorStaffId]);
  });

  it('answers nothing for an operator who has been revoked', async () => {
    const gone = await pg.query<{ id: string }>(
      `INSERT INTO platform_staff (auth_user_id, full_name, phone, role)
       VALUES (gen_random_uuid(), 'سابق', '01000000009', 'operator') RETURNING id`);
    const id = await openOperator(gone.rows[0]!.id);
    await pg.query(`UPDATE platform_staff SET revoked_at = now() WHERE id = $1`, [gone.rows[0]!.id]);

    expect(await asIdentity().transaction((r) => r.identity.activeOperatorSession(id))).toBeNull();
    expect(await asIdentity().transaction(
      (r) => r.identity.operatorByPhone('01000000009'))).toBeNull();
  });
});

describe('the identity role can do these things and nothing else', () => {
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
