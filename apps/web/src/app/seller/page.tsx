import type { Metadata } from 'next';
import { PageHead } from '@/features/shell/PageHead';
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
      {/* Identity v2: the register's page head, at the measure of a form. */}
      <PageHead kicker="For Houses" title="بوّابة الدور" className="mx-5 mb-7 lg:mx-0 lg:mt-[56px]" />
      <SellerSignIn />
    </main>
  );
}
