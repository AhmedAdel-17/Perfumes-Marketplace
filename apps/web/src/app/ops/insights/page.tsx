import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OpsNav } from '@/features/ops/OpsNav';
import { ConsoleHead } from '@/features/shell/ConsoleHead';
import { OwnerReport } from '@/features/ops/OwnerReport';
import { fetchOwnerReport, type ReportDays } from '@/features/ops/insights-actions';
import { activeOperator } from '@/features/ops/actions';

export const metadata: Metadata = {
  title: 'التقارير | ديار',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const OFFERED: readonly ReportDays[] = [1, 7, 30, 90];

/**
 * The owner's report — doc 04 §8 gate 8, "without database work".
 *
 * The period is read defensively, like the audit screen's query: this is a URL
 * an owner edits and pastes, and a report page is exactly where "the link I was
 * sent does not open" costs the most trust. An unoffered period falls back to
 * thirty days rather than failing.
 */
export default async function OpsInsightsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await activeOperator();
  if (!session) redirect('/ops');

  const params = await searchParams;
  const requested = Number(typeof params.days === 'string' ? params.days : NaN);
  const days: ReportDays = (OFFERED as readonly number[]).includes(requested)
    ? requested as ReportDays
    : 30;

  const result = await fetchOwnerReport(days);
  if (result === null) redirect('/ops');

  return (
    <main className="mx-auto max-w-phoneMax pb-9 lg:max-w-contentMax lg:px-8">
      <ConsoleHead
        kicker="Operations"
        title="التقارير"
        nav={<OpsNav current="insights" />}
        intro="كل رقم هنا محسوب بالتعريف نفسه الذي تُحسب به كشوف الدور. ما لا يسجّله النظام بعد يُذكر أنه غير مسجَّل، ولا يظهر صفرًا."
      />

      {result.ok ? (
        <OwnerReport report={result.report} />
      ) : (
        <p role="alert" className="px-5 py-10 text-bodyLg text-ink2 lg:px-0">
          {result.message}
        </p>
      )}
    </main>
  );
}
