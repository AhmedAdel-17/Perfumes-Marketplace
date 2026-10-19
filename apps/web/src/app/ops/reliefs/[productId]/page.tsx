import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { OpsNav } from '@/features/ops/OpsNav';
import { ConsoleHead } from '@/features/shell/ConsoleHead';
import { ReliefEditor } from '@/features/ops/ReliefEditor';
import { activeOperator } from '@/features/ops/actions';
import { fetchReliefs } from '@/features/ops/relief-actions';

export const metadata: Metadata = {
  title: 'العرض المجسّم | ديار',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/** One perfume's relief: lifting its bottle out of its primary photograph. */
export default async function OpsReliefPage({ params }: { params: Promise<{ productId: string }> }) {
  const session = await activeOperator();
  if (!session) redirect('/ops');
  const { productId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(productId)) notFound();
  const [row] = (await fetchReliefs(productId)) ?? [];
  if (!row) notFound();

  return (
    <main className="mx-auto max-w-phoneMax pb-9 lg:max-w-contentMax lg:px-8">
      <ConsoleHead
        kicker="Operations"
        title={`العرض المجسّم — ${row.name}`}
        nav={<OpsNav current="reliefs" />}
        intro={`${row.brandName}. صورة على خلفية سادة تُقصّ تلقائيًا؛ وإن لم تكن كذلك فارسم حدود الزجاجة بنفسك. راجع النتيجة قبل الحفظ.`}
      />
      <Link href="/ops/reliefs" className="mb-6 inline-flex min-h-touch items-center text-small text-ink2 hover:text-accent">→ كل العطور</Link>
      <ReliefEditor row={row} />
    </main>
  );
}
