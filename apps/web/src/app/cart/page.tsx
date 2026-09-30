import type { Metadata } from 'next';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { CartView } from '@/features/cart/CartView';
import { CART, SHELL } from '@diyar/i18n';
import { getLocale } from '@/core/locale';

/**
 * The bag.
 *
 * A server component whose only job is the frame. The contents cannot be
 * rendered on the server because the cart lives in the visitor's browser — so
 * the page ships the chrome instantly and `CartView` fills it once the store
 * has hydrated and the server has priced it.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: `${CART[locale].title} | ${SHELL[locale].titleSuffix}`,
    // Nothing here belongs in a search index, and a crawled cart URL is a support
    // ticket waiting to happen.
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

export default async function CartPage() {
  const locale = await getLocale();
  return (
    <>
      <SiteHeader />
      {/* 820px was the phone column with room to breathe. It is not a desktop
          layout: two columns need the content measure, and below `lg` this is
          still the capped phone column it always was. */}
      <main className="mx-auto max-w-phoneMax pb-8 lg:max-w-contentMax lg:px-8 lg:pb-[88px]">
        <h1 className="px-5 pb-5 pt-7 font-display text-h1 leading-heading lg:px-0 lg:pb-7 lg:pt-9 lg:text-h1Lg">
          {CART[locale].title}
        </h1>
        <CartView />
      </main>
      <SiteFooter />
    </>
  );
}
