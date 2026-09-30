import type { Metadata } from 'next';
import { ORDERS, SHELL } from '@diyar/i18n';
import { getLocale } from '@/core/locale';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { OrderLookup } from '@/features/orders/OrderLookup';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: `${ORDERS[locale].title} | ${SHELL[locale].titleSuffix}`,
    robots: { index: false, follow: false },
  };
}

/*
 * Rendered per request, not baked at build time.
 *
 * The footer reads the LIVE editorial pages, so a statically prerendered screen
 * freezes that list into the bundle — publishing or archiving a page would then
 * update the footer everywhere except here. Worse, `next build` renders it
 * against whatever database the BUILD MACHINE has, which in this repo is a
 * developer's local PGlite: a production bundle carrying a developer's content.
 *
 * Nothing on this screen benefits from prerendering — it is personal,
 * interactive, and never the same twice.
 */
export const dynamic = 'force-dynamic';

export default async function OrderPage() {
  const locale = await getLocale();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-phoneMax pb-9 lg:max-w-[720px] lg:px-8 lg:pb-[88px]">
        <h1 className="px-5 pb-6 pt-7 font-display text-h1 leading-heading lg:px-0 lg:pb-8 lg:pt-9 lg:text-h1Lg">
          {ORDERS[locale].title}
        </h1>
        <OrderLookup />
      </main>
      <SiteFooter />
    </>
  );
}
