import type { Metadata } from 'next';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { OrderLookup } from '@/features/orders/OrderLookup';

export const metadata: Metadata = {
  title: 'تتبّع الطلب | ديار',
  robots: { index: false, follow: false },
};

export default function OrderPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-phoneMax pb-9 lg:max-w-[720px] lg:px-8 lg:pb-[88px]">
        <h1 className="px-5 pb-6 pt-7 font-display text-h1 leading-heading lg:px-0 lg:pb-8 lg:pt-9 lg:text-h1Lg">
          تتبّع الطلب
        </h1>
        <OrderLookup />
      </main>
      <SiteFooter />
    </>
  );
}
