/** Focused proofs against real forced-RLS PostgreSQL in a disposable fixture. */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from './migrate';

let pg: PGlite;
const ownerA = '11111111-1111-1111-1111-111111111111';
const ownerB = '22222222-2222-2222-2222-222222222222';
const manager = '33333333-3333-3333-3333-333333333333';
const fulfilment = '44444444-4444-4444-4444-444444444444';
const viewer = '55555555-5555-5555-5555-555555555555';
const emptyOwner = '66666666-6666-6666-6666-666666666666';
let sellerA: string; let sellerB: string; let customerA: string; let customerB: string;
interface Row { customerRef: string; fullName: string | null; completedOrders: string; firstDeliveredAt: string; lastDeliveredAt: string }
interface Result { access: string; customers?: Row[]; profile?: (Row & { orders: Array<{ reference: string; deliveredAt: string }> }) | null }
async function scalar(query: string, args: unknown[] = []) { return (await pg.query<{ id: string }>(query, args)).rows[0]!.id; }
async function asActor<T>(role: string, id: string, query: string, args: unknown[] = [], before?: string): Promise<T[]> {
  await pg.exec('BEGIN');
  try {
    if (before) await pg.exec(before);
    await pg.query("SELECT set_config('app.actor_role',$1,true), set_config('app.actor_id',$2,true)", [role, id]);
    await pg.exec('SET LOCAL ROLE app_user');
    return (await pg.query<T>(query, args)).rows;
  } finally { await pg.exec('ROLLBACK'); }
}
async function ranking(role = 'seller', id = ownerA, limit: number | null = 20) {
  return (await asActor<{ result: Result }>(role, id, 'SELECT app.seller_customer_leaderboard($1) AS result', [limit]))[0]!.result;
}
async function profile(reference: string, id = ownerA, limit = 20) {
  return (await asActor<{ result: Result }>('seller', id, 'SELECT app.seller_customer_profile($1,$2) AS result', [reference, limit]))[0]!.result;
}

beforeAll(async () => {
  pg = new PGlite(); await applyMigrations(pg);
  await pg.exec("SET app.actor_role='platform'");
  const seller = (slug: string) => scalar('INSERT INTO sellers(trading_name,owner_name,slug,status) VALUES ($1,$1,$1,\'live\') RETURNING id', [slug]);
  sellerA = await seller('insights-a'); sellerB = await seller('insights-b');
  const sellerEmpty = await seller('insights-empty');
  for (const [sellerId, authId, role] of [[sellerA, ownerA, 'owner'], [sellerB, ownerB, 'owner'], [sellerA, manager, 'manager'], [sellerA, fulfilment, 'fulfilment'], [sellerA, viewer, 'viewer'], [sellerEmpty, emptyOwner, 'owner']]) {
    await pg.query('INSERT INTO seller_staff(seller_id,auth_user_id,role,full_name) VALUES($1,$2,$3,\'Staff\')', [sellerId, authId, role]);
  }
  customerA = await scalar('INSERT INTO customers(phone,full_name) VALUES(\'01001110001\',\'Actual Customer A\') RETURNING id');
  customerB = await scalar('INSERT INTO customers(phone,full_name) VALUES(\'01001110002\',\'Actual Customer B\') RETURNING id');
  const onlyB = await scalar('INSERT INTO customers(phone,full_name) VALUES(\'01001110003\',\'Only Brand B\') RETURNING id');
  let sequence = 0;
  const add = async (sellerId: string, customerId: string, reference: string, deliveredAt: string | null = '2020-01-02T10:00:00Z', state = 'delivered') => {
    const parent = await scalar(`INSERT INTO orders(reference,customer_id,contact_phone,contact_name,governorate,city,area,street,building,source,merchandise_piastres,shipping_piastres,total_piastres,payment_method)
      VALUES($1,$2,'01000000000','Order Contact','cairo','City','Area','Street','Building','organic_search',10000,0,10000,'cod') RETURNING id`, [`INS-${++sequence}`, customerId]);
    return scalar(`INSERT INTO sub_orders(order_id,seller_id,reference,merchandise_piastres,shipping_piastres,delivery_fulfilled_by,recipient_name,recipient_phone,governorate,city,area,street,building,state,delivered_at)
      VALUES($1,$2,$3,10000,0,'seller','Shared parcel recipient','01009999999','cairo','City','Area','Street','Building',$4,$5) RETURNING id`, [parent, sellerId, reference, state, deliveredAt]);
  };
  await add(sellerA, customerA, 'A-1'); await add(sellerA, customerA, 'A-2', '2020-01-03T10:00:00Z');
  await add(sellerA, customerB, 'A-OTHER-CUSTOMER');
  await add(sellerB, customerA, 'B-SHARED'); await add(sellerB, onlyB, 'B-ONLY');
  for (const status of ['requested', 'approved', 'in_transit', 'received', 'refunded', 'declined', 'closed']) {
    const sub = await add(sellerA, customerA, `A-RETURN-${status}`);
    const returned = await scalar('INSERT INTO returns(sub_order_id,reason) VALUES($1,\'defective\') RETURNING id', [sub]);
    if (status === 'refunded') {
      await pg.query("UPDATE returns SET status='received' WHERE id=$1", [returned]);
      await pg.query("UPDATE returns SET status='refunded',refund_piastres=100 WHERE id=$1", [returned]);
    } else if (status !== 'requested') await pg.query('UPDATE returns SET status=$2 WHERE id=$1', [returned, status]);
  }
  await add(sellerA, customerA, 'A-NO-DATE', null);
  await add(sellerA, customerA, 'A-FUTURE', '2099-01-01T00:00:00Z');
  await add(sellerA, customerA, 'A-CANCELLED', '2020-01-02T10:00:00Z', 'cancelled');
}, 60_000);
afterAll(async () => { await pg?.close(); });

describe('private owner customer insights', () => {
  it('ranks actual stable customer identities and exposes actual profile name only', async () => {
    const result = await ranking();
    expect(result.access).toBe('owner'); expect(result.customers).toHaveLength(2);
    expect(result.customers?.map(row => [row.fullName, row.completedOrders])).toEqual([['Actual Customer A', '2'], ['Actual Customer B', '1']]);
    const first = result.customers![0]!;
    expect(first.customerRef).toMatch(/^C-[a-f0-9]{32}$/);
    expect(new Date(first.firstDeliveredAt).toISOString()).toBe('2020-01-02T10:00:00.000Z');
    expect(new Date(first.lastDeliveredAt).toISOString()).toBe('2020-01-03T10:00:00.000Z');
    const json = JSON.stringify(result);
    for (const secret of [customerA, customerB, 'Shared parcel recipient', 'Order Contact', '01001110001', '01009999999', 'Street', 'Only Brand B']) expect(json).not.toContain(secret);
  });
  it('cannot learn another seller counts or use another seller profile reference', async () => {
    const a = (await ranking()).customers![0]!;
    const b = (await ranking('seller', ownerB)).customers!.find(row => row.fullName === 'Actual Customer A')!;
    expect(b.completedOrders).toBe('1'); expect(b.customerRef).not.toBe(a.customerRef);
    expect((await profile(a.customerRef, ownerB)).profile).toBeNull();
    const own = (await profile(a.customerRef)).profile!;
    expect(own.fullName).toBe('Actual Customer A'); expect(own.completedOrders).toBe('2');
    expect(own.orders.map(row => row.reference)).toEqual(['A-2', 'A-1']);
    expect((await profile(a.customerRef, ownerA, 1)).profile?.orders.map(row => row.reference)).toEqual(['A-2']);
    expect((await profile(`C-${'0'.repeat(32)}`)).profile).toBeNull();
  });
  it('denies nonowners and other actor roles, including platform', async () => {
    for (const id of [manager, fulfilment, viewer]) {
      expect(await ranking('seller', id)).toEqual({ access: 'restricted' });
      expect(await profile(`C-${'0'.repeat(32)}`, id)).toEqual({ access: 'restricted' });
    }
    for (const role of ['anon', 'customer', 'identity', 'platform']) {
      expect(await ranking(role, ownerA)).toEqual({ access: 'restricted' });
      const result = await asActor<{ result: Result }>(role, ownerA, 'SELECT app.seller_customer_profile($1,20) AS result', [`C-${'0'.repeat(32)}`]);
      expect(result[0]!.result).toEqual({ access: 'restricted' });
    }
    const revoked = await asActor<{ result: Result }>('seller', ownerA, 'SELECT app.seller_customer_leaderboard(20) AS result', [], `UPDATE seller_staff SET revoked_at=now() WHERE auth_user_id='${ownerA}'`);
    expect(revoked[0]!.result).toEqual({ access: 'restricted' });
    expect(await ranking('seller', emptyOwner)).toEqual({ access: 'owner', customers: [] });
  });
  it('fails closed for ambiguous house membership and preserves missing profile names', async () => {
    const ambiguous = await asActor<{ result: Result }>('seller', ownerA,
      'SELECT app.seller_customer_leaderboard(20) AS result', [],
      `INSERT INTO seller_staff(seller_id,auth_user_id,role,full_name) VALUES('${sellerB}','${ownerA}','owner','Additional membership')`);
    expect(ambiguous[0]!.result).toEqual({ access: 'restricted' });
    const missingName = await asActor<{ result: Result }>('seller', ownerA,
      'SELECT app.seller_customer_leaderboard(20) AS result', [],
      `UPDATE customers SET full_name=NULL WHERE id='${customerB}'`);
    expect(missingName[0]!.result.customers?.find(row => row.completedOrders === '1')?.fullName).toBeNull();
  });
  it('keeps parent/customer RLS blocked and validates bounded inputs', async () => {
    expect(await asActor('seller', ownerA, 'SELECT id FROM orders')).toEqual([]);
    expect(await asActor('seller', ownerA, 'SELECT id FROM customers')).toEqual([]);
    expect((await ranking('seller', ownerA, 1)).customers).toHaveLength(1);
    for (const limit of [null, 0, 51]) await expect(ranking('seller', ownerA, limit)).rejects.toBeDefined();
  });
  it('fixes search path, revokes public execution and fails closed under wrong ownership', async () => {
    const rows = await pg.query<{ proname: string; proconfig: string[]; public_execute: boolean }>(`SELECT p.proname,p.proconfig,
      EXISTS(SELECT 1 FROM aclexplode(p.proacl) acl WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE') AS public_execute
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname IN ('seller_customer_leaderboard','seller_customer_profile')`);
    expect(rows.rows).toHaveLength(2);
    for (const row of rows.rows) { expect(row.public_execute).toBe(false); expect(row.proconfig).toContain('search_path=pg_catalog'); expect(row.proconfig).toContain('row_security=off'); }
    await expect(asActor('seller', ownerA, 'SELECT app.seller_customer_leaderboard(20)', [], 'ALTER FUNCTION app.seller_customer_leaderboard(integer) OWNER TO app_user')).rejects.toBeDefined();
  });
});



