import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ContentList } from '@/features/ops/ContentList';
import { activeOperator, signOutOps } from '@/features/ops/actions';
import { api } from '@/core/api';

export const metadata: Metadata = {
  title: 'المحتوى | ديار',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function OpsContentPage() {
  const session = await activeOperator();
  if (!session) redirect('/ops');

  const pages = await api(
    { role: 'platform', id: session.authUserId },
    null,
    { staffId: session.staffId, role: session.role, label: session.fullName },
  ).content.list();

  return (
    <main className="mx-auto max-w-phoneMax pb-9 lg:max-w-[760px] lg:px-8">
      <header className="flex flex-wrap items-baseline justify-between gap-4 px-5 pb-7 pt-9 lg:px-0">
        <div>
          <div className="latin mb-3 text-micro tracking-label text-brass">OPERATIONS</div>
          <h1 className="font-display text-h1 leading-heading lg:text-h1Lg">المحتوى</h1>
          <p className="mt-2 text-caption text-faint">{session.fullName}</p>
        </div>
        <div className="flex items-center gap-5">
          <a
            href="/ops/queue"
            className="tappable flex min-h-touch min-w-touch items-center text-caption tracking-label text-faint transition-colors duration-base ease-out hover:text-brass"
          >
            قائمة التشغيل
          </a>
          <form action={signOutOps}>
            <button
              type="submit"
              className="tappable flex min-h-touch min-w-touch items-center justify-center text-caption tracking-label text-faint transition-colors duration-base ease-out hover:text-brass"
            >
              خروج
            </button>
          </form>
        </div>
      </header>
      <ContentList pages={pages} />
    </main>
  );
}
