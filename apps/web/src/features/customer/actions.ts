'use server';
import { randomInt } from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { consume, generateOtpCode } from '@diyar/api';
import type { CustomerAddressInput, CustomerProfileInput } from '@diyar/domain';
import { api } from '@/core/api';
import { identity } from '@/core/identity';
import { loginCodes } from '@/core/login-codes';
import { otpSender } from '@/core/otp';
import { localeHref } from '@/core/href';
import { getLocale } from '@/core/locale';
import { customerSession, issueCustomerSession, clearCustomerSession } from './session';
const normalize = (phone: string) => typeof phone==='string'?phone.trim().replace(/^0/, '+20'):'';
export async function requestCustomerCode(phone: string) {
    const value = normalize(phone);
    if (!/^\+201[0125]\d{8}$/.test(value))
        return { ok: false as const, reason: 'phone' as const };
    if (!consume('otp', value).allowed)
        return { ok: false as const, reason: 'limit' as const };
    try {
        const code = generateOtpCode(max => randomInt(max));
        await loginCodes().issue({ phone: value, audience: 'customer', code });
        await otpSender().send({ phone: value, code });
        return { ok: true as const };
    }
    catch {
        return { ok: false as const, reason: 'failed' as const };
    }
}
export async function verifyCustomerCode(phone: string, code: string) {
    const value = normalize(phone);
    if (!/^\+201[0125]\d{8}$/.test(value) || (typeof code!=='string'||!/^\d{6}$/.test(code.trim())))
        return { ok: false as const };
    try {
        if (await loginCodes().verify({ phone: value, audience: 'customer', code: code.trim() }) !== 'ok')
            return { ok: false as const };
        const principal = await identity.claimCustomer(value);
        await issueCustomerSession(principal.authUserId);
        return { ok: true as const };
    }
    catch {
        return { ok: false as const };
    }
}
async function caller() { const session = await customerSession(); return session ? api({ role: 'customer', id: session.authUserId }) : null; }
export async function saveCustomerProfile(input: CustomerProfileInput) { try {
    const call = await caller();
    if (!call)
        return { ok: false as const };
    await call.customerAccount.saveProfile(input as Parameters<typeof call.customerAccount.saveProfile>[0]);
    revalidatePath('/account');
    revalidatePath('/checkout');
    return { ok: true as const };
}
catch {
    return { ok: false as const };
} }
export async function addCustomerAddress(input: CustomerAddressInput) { try {
    const call = await caller();
    if (!call)
        return { ok: false as const };
    await call.customerAccount.addAddress(input as Parameters<typeof call.customerAccount.addAddress>[0]);
    revalidatePath('/account');
    revalidatePath('/checkout');
    return { ok: true as const };
}
catch {
    return { ok: false as const };
} }
export async function removeCustomerAddress(id: string) { try {
    const call = await caller();
    if (!call)
        return { ok: false as const };
    await call.customerAccount.removeAddress({ id });
    revalidatePath('/account');
    revalidatePath('/checkout');
    return { ok: true as const };
}
catch {
    return { ok: false as const };
} }
export async function signOutCustomer() { await clearCustomerSession(); redirect(localeHref(await getLocale(), '/')); }
export async function signOutCustomerEverywhere() { const session = await customerSession(); if (session)
    await identity.revokeAllSessions('customer', session.authUserId); await clearCustomerSession(); redirect(localeHref(await getLocale(), '/')); }
