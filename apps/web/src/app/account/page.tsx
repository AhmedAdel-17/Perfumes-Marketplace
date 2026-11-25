import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { api } from '@/core/api';
import { getLocale } from '@/core/locale';
import { localeHref } from '@/core/href';
import { customerSession } from '@/features/customer/session';
import { CustomerAccountView, type AccountTab } from '@/features/customer/CustomerAccountView';
import { OrderLookup } from '@/features/orders/OrderLookup';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { CUSTOMER_ACCOUNT } from '@diyar/i18n';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'My account | DIYAR', robots: { index: false, follow: false } };
export default async function Page({ searchParams }: {
    searchParams: Promise<{
        tab?: string;
        ref?: string;
        next?: string;
    }>;
}) {
    const locale = await getLocale(), q = await searchParams, session = await customerSession();
    if (!session)
        redirect(localeHref(locale, q.next === 'checkout' ? '/sign-in?next=checkout' : '/sign-in'));
    const call = api({ role: 'customer', id: session.authUserId }), profile = await call.customerAccount.profile();
    if (!profile)
        redirect(localeHref(locale, '/sign-in'));
    const next = q.next === 'checkout', tab: AccountTab = !profile.profileComplete ? 'profile' : (['addresses', 'orders', 'privacy'].includes(q.tab ?? '') ? q.tab as AccountTab : 'profile');
    if (next && profile.profileComplete && q.tab === undefined)
        redirect(localeHref(locale, '/checkout'));
    const addresses = tab === 'addresses' ? await call.customerAccount.addresses() : [], orders = tab === 'orders' ? await call.customerAccount.orders() : [];
    const selected = orders.find(o => o.reference === q.ref), detail = selected ? await call.orders.byReference({ reference: selected.reference, phone: selected.contactPhone }) : null;
    return <><SiteHeader /><main className="mx-auto max-w-contentMax px-5 py-9 lg:px-8"><h1 className="font-display text-h2 lg:text-h1">{CUSTOMER_ACCOUNT[locale].title}</h1><p className="mb-7 mt-3 text-body text-ink2">{CUSTOMER_ACCOUNT[locale].intro}</p><CustomerAccountView locale={locale} profile={profile} tab={tab} addresses={addresses} orders={orders} next={next}>{selected && detail && <OrderLookup initialReference={selected.reference} initialPhone={selected.contactPhone} initialOrder={detail}/>}</CustomerAccountView></main><SiteFooter /></>;
}
