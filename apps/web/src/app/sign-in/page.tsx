import type { Metadata } from 'next';
import { getLocale } from '@/core/locale';
import { customerSession } from '@/features/customer/session';
import { CustomerSignIn } from '@/features/customer/CustomerSignIn';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { redirect } from 'next/navigation';
import { localeHref } from '@/core/href';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sign in | DIYAR', robots: { index: false, follow: false } };
export default async function Page({ searchParams }: {
    searchParams: Promise<{
        next?: string;
    }>;
}) { const locale = await getLocale(), next = (await searchParams).next === 'checkout' ? 'checkout' : 'account'; if (await customerSession())
    redirect(localeHref(locale, next === 'checkout' ? '/account?next=checkout' : '/account')); return <><SiteHeader /><main className="mx-auto max-w-contentMax px-5 py-9 lg:px-8"><CustomerSignIn locale={locale} next={next} development={process.env.NODE_ENV === 'development'}/></main><SiteFooter /></>; }
