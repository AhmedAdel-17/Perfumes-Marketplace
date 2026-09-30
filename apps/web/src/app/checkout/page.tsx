import type { Metadata } from 'next';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { CheckoutForm } from '@/features/checkout/CheckoutForm';
import { Track } from '@/features/analytics/Track';
import { CHECKOUT, SHELL } from '@diyar/i18n';
import { getLocale } from '@/core/locale';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: `${CHECKOUT[locale].title} | ${SHELL[locale].titleSuffix}`,
    // A crawled checkout URL is a support ticket waiting to happen.
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

export default function CheckoutPage() {
  return (
    <>
      <SiteHeader />
      {/*
        The heading belongs to the FORM, not to the page, and that is a
        correctness fix rather than a refactor. This route renders two different
        things — a checkout and a confirmation — and a fixed page title meant a
        customer who had just paid was looking at "إتمام الطلب" above the words
        "تم استلام طلبك": a heading contradicting the state beneath it, with the
        real title demoted to an h2 under an h1 that no longer applied.
      */}
      {/*
        Reaching this screen is the last stage of the funnel that happens before
        an order exists — everything after it is measured from `sub_orders`.
        Renders nothing; see `Track`.
      */}
      <Track event="checkout_start" />
      <main className="mx-auto max-w-phoneMax lg:max-w-contentMax lg:px-8">
        <CheckoutForm />
      </main>
      <SiteFooter />
    </>
  );
}
