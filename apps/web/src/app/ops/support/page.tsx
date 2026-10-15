import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OpsNav } from '@/features/ops/OpsNav';
import { ConsoleHead } from '@/features/shell/ConsoleHead';
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
      <ConsoleHead
        kicker="Operations"
        title="الرسائل"
        nav={<OpsNav current="support" />}
        intro="مرتّبة بالأولوية ثم بالأقدم. ما تكتبه في «ما يظهر للعميل» يقرأه صاحب الرسالة كما هو."
      />

      <SupportQueue rows={rows ?? []} />
    </main>
  );
}
