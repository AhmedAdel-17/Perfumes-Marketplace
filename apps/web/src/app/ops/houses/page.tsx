import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OpsNav } from '@/features/ops/OpsNav';
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
      <header className="flex flex-wrap items-baseline justify-between gap-4 px-5 pb-7 pt-9 lg:px-0">
        <div>
          <div className="latin mb-3 text-micro tracking-label text-accent">OPERATIONS</div>
          <h1 className="font-display text-h1 leading-heading lg:text-h1Lg">الدور</h1>
          <p className="mt-2 max-w-proseMax text-caption leading-relaxed text-ink3">
            الدار لا تبدأ البيع لأن أحدًا ضغط زرًّا، بل لأن البنود الثمانية اكتملت
            وقاعدة البيانات سمحت بالانتقال. الأقدم أولًا.
          </p>
        </div>

        <OpsNav current="houses" />
      </header>

      <ApplicationsBoard rows={rows ?? []} />
    </main>
  );
}
