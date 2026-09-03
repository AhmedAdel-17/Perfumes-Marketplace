import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SellerSignIn } from '@/features/seller/SignIn';
import { readSellerSession } from '@/features/seller/session';

export const metadata: Metadata = {
  title: 'دخول الدور | ديار',
  robots: { index: false, follow: false },
};

export default async function SellerSignInPage() {
  // Already signed in — a sign-in form shown to someone who is signed in is a
  // dead end they have to guess their way out of.
  if (await readSellerSession()) redirect('/seller/orders');

  return (
    <main className="mx-auto max-w-phoneMax pb-9 lg:max-w-[560px] lg:px-8">
      <div className="px-5 pb-7 pt-9 lg:px-0 lg:pt-[88px]">
        <div className="latin mb-4 text-micro tracking-label text-brass">FOR HOUSES</div>
        <h1 className="font-display text-h1 leading-heading lg:text-h1Lg">بوّابة الدور</h1>
      </div>
      <SellerSignIn />
    </main>
  );
}
