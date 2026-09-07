import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OpsSignIn } from '@/features/ops/SignIn';
import { readOpsSession } from '@/features/ops/session';

export const metadata: Metadata = {
  title: 'التشغيل | ديار',
  robots: { index: false, follow: false },
};

export default async function OpsSignInPage() {
  if (await readOpsSession()) redirect('/ops/queue');

  return (
    <main className="mx-auto max-w-phoneMax pb-9 lg:max-w-[520px] lg:px-8">
      <div className="px-5 pb-7 pt-9 lg:px-0 lg:pt-[88px]">
        <div className="latin mb-4 text-micro tracking-label text-accent">OPERATIONS</div>
        <h1 className="font-display text-h1 leading-heading lg:text-h1Lg">التشغيل</h1>
      </div>
      <OpsSignIn />
    </main>
  );
}
