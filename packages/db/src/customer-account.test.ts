import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { applyMigrations } from './migrate';
import { DrizzleUnitOfWork, type DiyarDatabase } from './repositories';
import * as schema from './schema/index';
let pg: PGlite, db: DiyarDatabase;
let a: {
    customerId: string;
    authUserId: string;
    phone: string;
}, b: typeof a;
const as = (role: 'identity' | 'customer' | 'seller' | 'anon', id: string | null = null) => new DrizzleUnitOfWork(db, { role, id });
const input = { fullName: 'Test Customer', email: null, dateOfBirth: '1998-03-14', gender: 'female' as const, families: ['floral'], notes: ['Rose'], occasions: ['work'], seasons: ['spring'], concentrations: ['edp'], bottleSizes: [50], budgetMinPiastres: 10000, budgetMaxPiastres: 200000, personalizationConsent: false, marketingConsent: false };
beforeAll(async () => { pg = new PGlite(); await applyMigrations(pg); db = drizzle(pg, { schema }) as unknown as DiyarDatabase; await pg.query("INSERT INTO customers(phone,full_name) VALUES('01001110001','Legacy Customer')"); a = await as('identity').transaction(r => r.identity.claimCustomer('+201001110001')); b = await as('identity').transaction(r => r.identity.claimCustomer('+201001110002')); }, 60000);
afterAll(async () => { await pg?.close(); });
describe('customer account isolation', () => {
    it('claims a legacy phone once without replacing its identity or inventing demographics', async () => { expect(await as('identity').transaction(r => r.identity.claimCustomer(a.phone))).toEqual(a); expect(await as('customer', a.authUserId).transaction(r => r.account.profile())).toMatchObject({ fullName: 'Legacy Customer', profileComplete: false, gender: null, dateOfBirth: '', marketingConsent: false }); expect((await pg.query('SELECT id FROM customers')).rows).toHaveLength(2); });
    it('saves profile/history atomically and isolates seller/other customer reads', async () => { await as('customer', a.authUserId).transaction(r => r.account.saveProfile(input)); expect(await as('customer', a.authUserId).transaction(r => r.account.profile())).toMatchObject({ ...input, profileComplete: true }); expect(await as('customer', b.authUserId).transaction(r => r.account.profile())).toMatchObject({ profileComplete: false }); expect(await as('seller', b.authUserId).transaction(r => r.account.profile())).toBeNull(); expect((await pg.query('SELECT * FROM customer_profile_history')).rows).toHaveLength(1);expect((await pg.query('SELECT purpose,granted FROM consent_records')).rows).toEqual(expect.arrayContaining([{purpose:'personalization',granted:'false'},{purpose:'marketing_sms',granted:'false'}])); });
    it('refuses invalid demographics/budgets and rolls back earlier changes', async () => { for (const patch of [{ dateOfBirth: '2099-01-01' }, { gender: 'invalid' }, { budgetMinPiastres: 300000 }])
        await expect(as('customer', a.authUserId).transaction(r => r.account.saveProfile({ ...input, fullName: 'Must roll back', ...patch } as typeof input))).rejects.toThrow(); expect((await as('customer', a.authUserId).transaction(r => r.account.profile()))?.fullName).toBe(input.fullName); });
    it('isolates address deletes and keeps one default', async () => { const addr = { label: 'Home', governorate: 'cairo', city: 'Cairo', area: 'Nasr City', street: 'Example', building: '1', floor: null, apartment: null, landmark: null, contactPhone: a.phone, isDefault: true }; await as('customer', a.authUserId).transaction(r => r.account.addAddress(addr)); await as('customer', a.authUserId).transaction(r => r.account.addAddress({ ...addr, label: 'Work' })); const own = await as('customer', a.authUserId).transaction(r => r.account.addresses()); expect(own.filter(x => x.isDefault)).toHaveLength(1); expect(await as('customer', b.authUserId).transaction(r => r.account.addresses())).toEqual([]); await as('customer', b.authUserId).transaction(r => r.account.removeAddress(own[0]!.id)); expect(await as('customer', a.authUserId).transaction(r => r.account.addresses())).toHaveLength(2); });
    it('isolates session audiences and immediately revokes copied credentials', async () => { const id = await as('identity').transaction(r => r.identity.openSession({ audience: 'customer', principalId: a.authUserId, sellerId: null, ttlSeconds: 3600, ipHash: null, uaHash: null })); expect(await as('identity').transaction(r => r.identity.activeCustomerSession(id))).toMatchObject(a); expect(await as('identity').transaction(r => r.identity.activeSellerSession(id))).toBeNull(); expect(await as('identity').transaction(r => r.identity.activeOperatorSession(id))).toBeNull(); await as('identity').transaction(r => r.identity.revokeSession(id)); expect(await as('identity').transaction(r => r.identity.activeCustomerSession(id))).toBeNull(); });
    it('refuses ambiguous aliases and anonymous profile reads', async () => { await pg.query("INSERT INTO customers(phone) VALUES('01001110003'),('+201001110003')"); await expect(as('identity').transaction(r => r.identity.claimCustomer('+201001110003'))).rejects.toThrow('account review'); expect(await as('anon').transaction(r => r.account.profile())).toBeNull(); });
    it('guards verified phone identity against direct customer updates',async()=>{
        await pg.exec('BEGIN');
        try {
            await pg.query("SELECT set_config('app.actor_role','customer',true),set_config('app.actor_id',$1,true)",[a.authUserId]);
            await pg.exec('SET LOCAL ROLE app_user');
            await expect(pg.query('UPDATE customers SET phone=$1 WHERE id=$2',['+201099999999',a.customerId])).rejects.toThrow('customer identity is managed by verified sign-in');
        } finally {await pg.exec('ROLLBACK');}
    });

});
