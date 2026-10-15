import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ReturnQueue } from '@/features/seller/ReturnQueue';
import { SellerNav } from '@/features/seller/SellerNav';
import { ConsoleHead } from '@/features/shell/ConsoleHead';
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
      <ConsoleHead
        kicker="Returns"
        title="الإرجاع"
        nav={<SellerNav current="returns" />}
        intro="العيب والتلف والمنتج الخطأ تُقبل دائمًا — القانون لا يترك ذلك لسياسة البائع. سياستك تحكم حالة واحدة: تغيير الرأي."
      />
      <ReturnQueue />
    </main>
  );
}
