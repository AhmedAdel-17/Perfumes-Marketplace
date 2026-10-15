import type { Metadata } from 'next';
import { ORDERS, SHELL } from '@diyar/i18n';
import { getLocale } from '@/core/locale';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { PageHead } from '@/features/shell/PageHead';
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
      <main className="mx-auto max-w-phoneMax pb-9 lg:max-w-[720px] lg:px-8 lg:pb-[104px]">
        {/* Identity v2: the register's page head, ruled at full strength. */}
        <PageHead kicker={ORDERS[locale].kicker} title={ORDERS[locale].title} className="mx-5 mb-6 lg:mx-0 lg:mb-8" />
        <OrderLookup />
      </main>
      <SiteFooter />
    </>
  );
}
