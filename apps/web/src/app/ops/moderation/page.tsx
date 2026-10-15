import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ModerationQueue } from '@/features/ops/ModerationQueue';
import { OpsNav } from '@/features/ops/OpsNav';
import { ConsoleHead } from '@/features/shell/ConsoleHead';
import { fetchModerationQueue } from '@/features/ops/moderation-actions';
import { activeOperator } from '@/features/ops/actions';

export const metadata: Metadata = {
  title: 'مراجعة المنتجات | ديار',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function OpsModerationPage() {
  const session = await activeOperator();
  if (!session) redirect('/ops');

  const rows = await fetchModerationQueue();

  /*
    760px was the phone column with margins — a working tool rendered at just
    over half the monitor it is used on, with every row stretched to reach both
    of its edges. The console gets the content measure, and the lists inside it
    get columns so the extra width becomes room rather than distance.
    DESIGN_DOCTRINE §4b.
  */
  return (
    <main className="mx-auto max-w-phoneMax pb-9 lg:max-w-contentMax lg:px-8">
      <ConsoleHead
        kicker="Operations"
        title="مراجعة المنتجات"
        nav={<OpsNav current="moderation" />}
        intro={<>{session.fullName}</>}
      />
      <ModerationQueue rows={rows ?? []} />
    </main>
  );
}
