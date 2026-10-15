import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OpsNav } from '@/features/ops/OpsNav';
import { ConsoleHead } from '@/features/shell/ConsoleHead';
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
      <ConsoleHead
        kicker="Operations"
        title="الإرجاع"
        nav={<OpsNav current="returns" />}
        intro="لا يُردّ مبلغ قبل أن تصل العبوة ويُسجَّل استلامها. كل ردّ يُقيَّد في سجل المراجعة باسم من نفّذه."
      />

      <ReturnsBoard rows={rows ?? []} />
    </main>
  );
}
