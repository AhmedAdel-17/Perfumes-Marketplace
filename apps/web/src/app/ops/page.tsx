import type { Metadata } from 'next';
import { PageHead } from '@/features/shell/PageHead';
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
      {/* Identity v2: the register's page head, at the measure of a form. */}
      <PageHead kicker="Operations" title="التشغيل" className="mx-5 mb-7 lg:mx-0 lg:mt-[56px]" />
      <OpsSignIn />
    </main>
  );
}
