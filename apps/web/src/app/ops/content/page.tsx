import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ContentList } from '@/features/ops/ContentList';
import { OpsNav } from '@/features/ops/OpsNav';
import { ConsoleHead } from '@/features/shell/ConsoleHead';
import { activeOperator } from '@/features/ops/actions';
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
        title="المحتوى"
        nav={<OpsNav current="content" />}
        intro={<>{session.fullName}</>}
      />
      <ContentList pages={pages} />
    </main>
  );
}
