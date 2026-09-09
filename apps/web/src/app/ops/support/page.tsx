import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OpsNav } from '@/features/ops/OpsNav';
import { SupportQueue } from '@/features/ops/SupportQueue';
import { fetchTickets } from '@/features/ops/support-actions';
import { activeOperator } from '@/features/ops/actions';

export const metadata: Metadata = {
  title: 'الرسائل | ديار',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * What is open, in the order it should be worked.
 *
 * Closed tickets are not here. A queue that shows everything is a queue where
 * the twelve rows that need somebody today are buried under six months of
 * resolved ones — and the operator stops opening it.
 */
export default async function OpsSupportPage() {
  const session = await activeOperator();
  if (!session) redirect('/ops');

  const rows = await fetchTickets(false);

  return (
    <main className="mx-auto max-w-phoneMax pb-9 lg:max-w-contentMax lg:px-8">
      <header className="flex flex-wrap items-baseline justify-between gap-4 px-5 pb-7 pt-9 lg:px-0">
        <div>
          <div className="latin mb-3 text-micro tracking-label text-accent">OPERATIONS</div>
          <h1 className="font-display text-h1 leading-heading lg:text-h1Lg">الرسائل</h1>
          <p className="mt-2 max-w-proseMax text-caption leading-relaxed text-ink3">
            مرتّبة بالأولوية ثم بالأقدم. ما تكتبه في «ما يظهر للعميل» يقرأه صاحب
            الرسالة كما هو.
          </p>
        </div>

        <OpsNav current="support" />
      </header>

      <SupportQueue rows={rows ?? []} />
    </main>
  );
}
