import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OpsWorkQueue } from '@/features/ops/WorkQueue';
import { activeOperator, signOutOps } from '@/features/ops/actions';

export const metadata: Metadata = {
  title: 'قائمة التشغيل | ديار',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function OpsQueuePage() {
  const session = await activeOperator();
  if (!session) redirect('/ops');

  return (
    <main className="mx-auto max-w-phoneMax pb-9 lg:max-w-[760px] lg:px-8">
      <header className="flex flex-wrap items-baseline justify-between gap-4 px-5 pb-7 pt-9 lg:px-0">
        <div>
          <div className="latin mb-3 text-micro tracking-label text-brass">OPERATIONS</div>
          <h1 className="font-display text-h1 leading-heading lg:text-h1Lg">قائمة التشغيل</h1>
          {/* Named, because every action here is attributable to a person. */}
          <p className="mt-2 text-caption text-faint">{session.fullName}</p>
        </div>
        <form action={signOutOps}>
          <button
            type="submit"
            className="tappable flex min-h-touch items-center text-caption tracking-label text-faint transition-colors duration-base ease-out hover:text-brass"
          >
            خروج
          </button>
        </form>
      </header>
      <OpsWorkQueue />
    </main>
  );
}
