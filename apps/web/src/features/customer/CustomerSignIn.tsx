'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CUSTOMER_ACCOUNT, type Locale } from '@diyar/i18n';
import { localeHref } from '@/core/href';
import { Field } from '@/features/checkout/Field';
import { PrimaryButton } from '@/features/shell/PrimaryButton';
import { requestCustomerCode, verifyCustomerCode } from './actions';
export function CustomerSignIn({ locale, next, development }: {
    locale: Locale;
    next: 'checkout' | 'account';
    development: boolean;
}) {
    const c = CUSTOMER_ACCOUNT[locale], router = useRouter(), busy = useRef(false);
    const [phone, setPhone] = useState(''), [code, setCode] = useState(''), [sent, setSent] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState('');
    async function send() { if (busy.current)
        return; busy.current = true; setPending(true); setError(''); try {
        const result = await requestCustomerCode(phone);
        if (result.ok) {
            setSent(true);
            setCode('');
        }
        else
            setError(result.reason === 'phone' ? c.invalidPhone : result.reason === 'limit' ? c.limit : c.failed);
    }
    catch {
        setError(c.failed);
    }
    finally {
        busy.current = false;
        setPending(false);
    } }
    async function submit(e: React.FormEvent) { e.preventDefault(); if (!sent) {
        await send();
        return;
    } if (busy.current)
        return; busy.current = true; setPending(true); setError(''); try {
        const result = await verifyCustomerCode(phone, code);
        if (!result.ok)
            setError(c.invalidCode);
        else {
            router.replace(localeHref(locale, next === 'checkout' ? '/account?next=checkout' : '/account'));
            router.refresh();
        }
    }
    catch {
        setError(c.failed);
    }
    finally {
        busy.current = false;
        setPending(false);
    } }
    return <div className="mx-auto max-w-proseMax"><h1 className="font-display text-h2 lg:text-h1">{c.signIn}</h1><p className="my-5 text-body text-ink2">{c.signInIntro}</p><form onSubmit={submit} className="border border-line bg-raised p-6"><Field label={c.phone} value={phone} onChange={v => { setPhone(v); setCode(''); setSent(false); setError(''); }} type="tel" inputMode="tel" autoComplete="tel" required maxLength={14}/>{sent && <><p role="status" className="mb-4 text-body text-ink2">{c.codeSent}</p><Field label={c.code} value={code} onChange={setCode} inputMode="numeric" autoComplete="one-time-code" required maxLength={6}/></>}{error && <p role="alert" className="mb-4 text-body text-danger">{error}</p>}<PrimaryButton type="submit" disabled={pending} fill="full">{sent ? c.verify : c.send}</PrimaryButton>{sent && <button type="button" onClick={() => void send()} disabled={pending} className="mt-3 min-h-touch text-body text-accent underline">{c.resend}</button>}{development && <p className="mt-5 border-t border-line pt-4 text-small text-ink2">{c.dev}</p>}</form><Link className="mt-5 inline-flex min-h-touch items-center text-accent underline" href={localeHref(locale, '/support')}>{c.support}</Link></div>;
}
