import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { CUSTOMER_GENDERS, SCENT_PREFERENCES, SEASON_PREFERENCES, OCCASION_PREFERENCES, CONCENTRATION_PREFERENCES, GOVERNORATES } from '@diyar/domain';
import { router, publicProcedure } from '../trpc';
import { phoneSchema } from '../validation';
/** Authenticated facade; RLS independently scopes every personal read/write. */
const customerProcedure = publicProcedure.use(({ ctx, next }) => {
    if (ctx.actor.role !== 'customer' || !ctx.actor.id)
        throw new TRPCError({ code: 'UNAUTHORIZED' });
    return next({ ctx });
});
const distinct = <T>(xs: T[]) => [...new Set(xs)];
const profile = z.object({
    fullName: z.string().trim().min(2).max(80), email: z.string().trim().email().max(254).nullable(),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const d = new Date(v + 'T00:00:00Z'); return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v && v >= '1900-01-01' && v <= new Date().toISOString().slice(0, 10); }), gender: z.enum(CUSTOMER_GENDERS),
    families: z.array(z.enum(SCENT_PREFERENCES)).max(8).transform(distinct), notes: z.array(z.string().trim().min(1).max(50)).max(30).transform(distinct),
    occasions: z.array(z.enum(OCCASION_PREFERENCES)).max(4).transform(distinct), seasons: z.array(z.enum(SEASON_PREFERENCES)).max(4).transform(distinct), concentrations: z.array(z.enum(CONCENTRATION_PREFERENCES)).max(4).transform(distinct), bottleSizes: z.array(z.number().int().min(1).max(2000)).max(10).transform(distinct),
    budgetMinPiastres: z.number().int().min(0).max(2147483647).nullable(), budgetMaxPiastres: z.number().int().min(0).max(2147483647).nullable(), personalizationConsent: z.boolean(), marketingConsent: z.boolean(),
}).strict().refine(p => p.budgetMinPiastres === null || p.budgetMaxPiastres === null || p.budgetMinPiastres <= p.budgetMaxPiastres);
const text = (max: number) => z.string().trim().min(1).max(max);
export const customerAccountRouter = router({
    profile: customerProcedure.query(({ ctx }) => ctx.uow.transaction(r => r.account.profile())),
    saveProfile: customerProcedure.input(profile).mutation(({ ctx, input }) => ctx.uow.transaction(r => r.account.saveProfile(input))),
    addresses: customerProcedure.query(({ ctx }) => ctx.uow.transaction(r => r.account.addresses())),
    addAddress: customerProcedure.input(z.object({ label: z.string().trim().max(40).nullable(), governorate: z.enum(GOVERNORATES), city: text(80), area: text(80), street: text(160), building: text(40), floor: z.string().max(20).nullable(), apartment: z.string().max(20).nullable(), landmark: z.string().max(200).nullable(), contactPhone: phoneSchema, isDefault: z.boolean() }).strict()).mutation(({ ctx, input }) => ctx.uow.transaction(r => r.account.addAddress(input))),
    removeAddress: customerProcedure.input(z.object({ id: z.string().uuid() }).strict()).mutation(({ ctx, input }) => ctx.uow.transaction(r => r.account.removeAddress(input.id))),
    orders: customerProcedure.query(({ ctx }) => ctx.uow.transaction(r => r.account.orders())),
});
