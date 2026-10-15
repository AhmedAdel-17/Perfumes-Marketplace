import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OpsNav } from '@/features/ops/OpsNav';
import { ConsoleHead } from '@/features/shell/ConsoleHead';
import { NoteGlossary } from '@/features/ops/NoteGlossary';
import { fetchGlossary } from '@/features/ops/glossary-actions';
import { activeOperator } from '@/features/ops/actions';

export const metadata: Metadata = {
  title: 'قاموس النفحات | ديار',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The English names of scent notes (D-3; migration 0030).
 *
 * Houses write their notes in Arabic; the English storefront prints each one
 * through this glossary, and shows the Arabic where it has no entry yet.
 */
export default async function OpsNotesPage() {
  const session = await activeOperator();
  if (!session) redirect('/ops');

  const rows = await fetchGlossary();

  return (
    <main className="mx-auto max-w-phoneMax pb-9 lg:max-w-contentMax lg:px-8">
      <ConsoleHead
        kicker="Operations"
        title="قاموس النفحات"
        nav={<OpsNav current="notes" />}
        intro="الاسم الإنجليزي لكل نفحة كما تكتبها الدور. يظهر في النسخة الإنجليزية من كل عطر يحملها، والنفحة التي لا اسم لها تظهر بالعربية. كل تعديل يُسجَّل في سجل القرارات."
      />

      <NoteGlossary rows={rows ?? []} />
    </main>
  );
}
