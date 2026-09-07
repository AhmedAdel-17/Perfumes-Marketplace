import type { Metadata } from 'next';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { CartView } from '@/features/cart/CartView';

/**
 * The bag.
 *
 * A server component whose only job is the frame. The contents cannot be
 * rendered on the server because the cart lives in the visitor's browser — so
 * the page ships the chrome instantly and `CartView` fills it once the store
 * has hydrated and the server has priced it.
 */
export const metadata: Metadata = {
  title: 'الحقيبة | ديار',
  // Nothing here belongs in a search index, and a crawled cart URL is a support
  // ticket waiting to happen.
  robots: { index: false, follow: false },
};

export default function CartPage() {
  return (
    <>
      <SiteHeader />
      {/* 820px was the phone column with room to breathe. It is not a desktop
          layout: two columns need the content measure, and below `lg` this is
          still the capped phone column it always was. */}
      <main className="mx-auto max-w-phoneMax pb-8 lg:max-w-contentMax lg:px-8 lg:pb-[88px]">
        <h1 className="px-5 pb-5 pt-7 font-display text-h1 leading-heading lg:px-0 lg:pb-7 lg:pt-9 lg:text-h1Lg">
          الحقيبة
        </h1>
        <CartView />
      </main>
      <SiteFooter />
    </>
  );
}
