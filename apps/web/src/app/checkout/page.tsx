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
      <main className="mx-auto max-w-phoneMax lg:max-w-[720px] lg:px-8">
        <h1 className="px-5 pb-6 pt-7 font-display text-h1 leading-heading lg:px-0 lg:pb-8 lg:pt-9 lg:text-h1Lg">
          إتمام الطلب
        </h1>
        <CheckoutForm />
      </main>
      <SiteFooter />
    </>
  );
}
