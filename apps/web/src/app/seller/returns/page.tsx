import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ReturnQueue } from '@/features/seller/ReturnQueue';
import { SellerNav } from '@/features/seller/SellerNav';
import { activeSellerSession } from '@/features/seller/actions';

export const metadata: Metadata = {
  title: 'الإرجاع | ديار',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function SellerReturnsPage() {
  // The same revocation-aware check the actions use. Reading the cookie alone
  // would render the portal for somebody whose access was withdrawn.
  if (!(await activeSellerSession())) redirect('/seller');

  return (
    <main className="mx-auto max-w-phoneMax pb-9 lg:max-w-contentMax lg:px-8">
      <header className="flex flex-wrap items-baseline justify-between gap-4 px-5 pb-7 pt-9 lg:px-0">
        <div>
          <div className="latin mb-3 text-micro tracking-label text-accent">RETURNS</div>
          <h1 className="font-display text-h1 leading-heading lg:text-h1Lg">الإرجاع</h1>
          <p className="mt-2 max-w-proseMax text-caption leading-relaxed text-ink3">
            العيب والتلف والمنتج الخطأ تُقبل دائمًا — القانون لا يترك ذلك لسياسة
            البائع. سياستك تحكم حالة واحدة: تغيير الرأي.
          </p>
        </div>
        <SellerNav current="returns" />
      </header>
      <ReturnQueue />
    </main>
  );
}
