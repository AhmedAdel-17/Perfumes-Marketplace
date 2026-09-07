import type { Metadata } from 'next';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { CheckoutForm } from '@/features/checkout/CheckoutForm';

export const metadata: Metadata = {
  title: 'إتمام الطلب | ديار',
  // A crawled checkout URL is a support ticket waiting to happen.
  robots: { index: false, follow: false },
};

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
      <main className="mx-auto max-w-phoneMax lg:max-w-contentMax lg:px-8">
        <CheckoutForm />
      </main>
      <SiteFooter />
    </>
  );
}
