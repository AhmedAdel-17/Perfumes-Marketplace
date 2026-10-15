import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OpsNav } from '@/features/ops/OpsNav';
import { ConsoleHead } from '@/features/shell/ConsoleHead';
import { ApplicationsBoard } from '@/features/ops/ApplicationsBoard';
import { fetchApplications } from '@/features/ops/application-actions';
import { activeOperator } from '@/features/ops/actions';

export const metadata: Metadata = {
  title: 'الدور | ديار',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Houses applying to join.
 *
 * `sellers.status` has had `'applied'` in its enum since the first migration
 * and nothing could ever create one — a house joined this marketplace by
 * somebody typing SQL. This is the screen at the other end of the public
 * application form.
 */
export default async function OpsHousesPage() {
  const session = await activeOperator();
  if (!session) redirect('/ops');

  const rows = await fetchApplications();

  return (
    <main className="mx-auto max-w-phoneMax pb-9 lg:max-w-contentMax lg:px-8">
      <ConsoleHead
        kicker="Operations"
        title="الدور"
        nav={<OpsNav current="houses" />}
        intro="الدار لا تبدأ البيع لأن أحدًا ضغط زرًّا، بل لأن البنود الثمانية اكتملت وقاعدة البيانات سمحت بالانتقال. الأقدم أولًا."
      />

      <ApplicationsBoard rows={rows ?? []} />
    </main>
  );
}
