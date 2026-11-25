import { and, desc, eq, sql } from 'drizzle-orm';
import type { CustomerAccountRepository } from '@diyar/domain';
import * as s from './schema/index';
import type { DiyarDatabase } from './repositories';
/** Repository facade: actor identity is resolved by RLS, never accepted from an input. */
export const customerAccountRepository = (db: DiyarDatabase): CustomerAccountRepository => ({
    async profile() {
        const [row] = await db.select({ customer: s.customers, profile: s.customerProfiles }).from(s.customers)
            .leftJoin(s.customerProfiles, eq(s.customerProfiles.customerId, s.customers.id)).limit(1);
        if (!row)
            return null;
        const p = row.profile;
        return { customerId: row.customer.id, phone: row.customer.phone, fullName: row.customer.fullName ?? '', email: row.customer.email,
            dateOfBirth: p?.dateOfBirth ?? '', gender: (p?.gender ?? null) as 'female' | 'male' | 'other' | null, profileComplete: !!p, updatedAt: p?.updatedAt.toISOString() ?? null,
            families: p?.families ?? [], notes: p?.notes ?? [], occasions: p?.occasions ?? [], seasons: p?.seasons ?? [], concentrations: p?.concentrations ?? [], bottleSizes: p?.bottleSizes ?? [],
            budgetMinPiastres: p?.budgetMinPiastres ?? null, budgetMaxPiastres: p?.budgetMaxPiastres ?? null, personalizationConsent: p?.personalizationConsent ?? false, marketingConsent: p?.marketingConsent ?? false };
    },
    async saveProfile(input) {
        const [customer] = await db.select({ id: s.customers.id }).from(s.customers).limit(1);
        if (!customer)
            throw new Error('Customer session unavailable');
        const { fullName, email, ...profile } = input;
        await db.update(s.customers).set({ fullName, email, updatedAt: sql `now()` }).where(eq(s.customers.id, customer.id));
        await db.insert(s.consentRecords).values([
            {customerId:customer.id,purpose:'personalization',granted:String(input.personalizationConsent),source:'customer_account:v1'},
            {customerId:customer.id,purpose:'marketing_sms',granted:String(input.marketingConsent),source:'customer_account:v1'},
        ]);
        await db.insert(s.customerProfiles).values({ customerId: customer.id, ...profile }).onConflictDoUpdate({ target: s.customerProfiles.customerId, set: { ...profile, updatedAt: sql `now()` } });
    },
    async addresses() { return db.select().from(s.customerAddresses).orderBy(desc(s.customerAddresses.createdAt)).limit(50); },
    async addAddress(input) {
        const [customer] = await db.select({ id: s.customers.id }).from(s.customers).limit(1);
        if (!customer)
            throw new Error('Customer session unavailable');
        // Lock the customer so concurrent default-address changes are serialized.
        await db.select({ id: s.customers.id }).from(s.customers).where(eq(s.customers.id, customer.id)).for('update');
        const existing = await db.select({ id: s.customerAddresses.id }).from(s.customerAddresses).limit(50);
        if (existing.length >= 50)
            throw new Error('Address limit reached');
        if (input.isDefault)
            await db.update(s.customerAddresses).set({ isDefault: false }).where(eq(s.customerAddresses.customerId, customer.id));
        await db.insert(s.customerAddresses).values({ ...input, governorate: input.governorate as typeof s.customerAddresses.$inferInsert.governorate, customerId: customer.id });
    },
    async removeAddress(id) { await db.delete(s.customerAddresses).where(eq(s.customerAddresses.id, id)); },
    async orders() { const rows = await db.select({ reference: s.orders.reference, contactPhone: s.orders.contactPhone, totalPiastres: s.orders.totalPiastres, placedAt: s.orders.placedAt }).from(s.orders).orderBy(desc(s.orders.placedAt)).limit(100); return rows.map(r => ({ ...r, placedAt: r.placedAt.toISOString() })); },
});
