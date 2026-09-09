import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OpsNav } from '@/features/ops/OpsNav';
import { ReturnsBoard } from '@/features/ops/ReturnsBoard';
import { fetchAllReturns } from '@/features/ops/return-actions';
import { activeOperator } from '@/features/ops/actions';

export const metadata: Metadata = {
  title: 'الإرجاع | ديار',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function OpsReturnsPage() {
  const session = await activeOperator();
  if (!session) redirect('/ops');

  const rows = await fetchAllReturns();

  return (
    <main className="mx-auto max-w-phoneMax pb-9 lg:max-w-contentMax lg:px-8">
      <header className="flex flex-wrap items-baseline justify-between gap-4 px-5 pb-7 pt-9 lg:px-0">
        <div>
          <div className="latin mb-3 text-micro tracking-label text-accent">OPERATIONS</div>
          <h1 className="font-display text-h1 leading-heading lg:text-h1Lg">الإرجاع</h1>
          <p className="mt-2 max-w-proseMax text-caption leading-relaxed text-ink3">
            لا يُردّ مبلغ قبل أن تصل العبوة ويُسجَّل استلامها. كل ردّ يُقيَّد في سجل
            المراجعة باسم من نفّذه.
          </p>
        </div>

        <OpsNav current="returns" />
      </header>

      <ReturnsBoard rows={rows ?? []} />
    </main>
  );
}
