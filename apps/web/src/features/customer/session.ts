import 'server-only';
import { cookies } from 'next/headers';
import { identity } from '@/core/identity';
import { openSessionId, sealSessionId, requestFingerprint } from '@/core/session-cookie';
/** Existing revocable-session pattern, isolated by cookie, secret and audience. */
const COOKIE = 'diyar_customer', TTL = 60 * 60 * 24 * 7;
function secret() { const value = process.env.CUSTOMER_SESSION_SECRET; if (value)
    return value; if (process.env.NODE_ENV === 'production')
    throw new Error('CUSTOMER_SESSION_SECRET is required'); return 'customer-development-only-not-a-secret'; }
export async function customerSession() { const raw = (await cookies()).get(COOKIE)?.value; if (!raw)
    return null; const id = openSessionId(secret(), raw); return id ? identity.activeCustomerSession(id) : null; }
export async function issueCustomerSession(principalId: string) { const sessionId = await identity.openSession({ audience: 'customer', principalId, sellerId: null, ttlSeconds: TTL, ...await requestFingerprint(secret()) }); (await cookies()).set(COOKIE, sealSessionId(secret(), sessionId), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: TTL }); }
export async function clearCustomerSession() { const current = await customerSession(); if (current)
    await identity.revokeSession(current.sessionId); (await cookies()).delete(COOKIE); }
