import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OpsNav } from '@/features/ops/OpsNav';
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
      <header className="flex flex-wrap items-baseline justify-between gap-4 px-5 pb-7 pt-9 lg:px-0">
        <div>
          <div className="latin mb-3 text-micro tracking-label text-accent">OPERATIONS</div>
          <h1 className="font-display text-h1 leading-heading lg:text-h1Lg">قاموس النفحات</h1>
          <p className="mt-2 max-w-proseMax text-caption leading-relaxed text-ink3">
            الاسم الإنجليزي لكل نفحة كما تكتبها الدور. يظهر في النسخة الإنجليزية من كل
            عطر يحملها، والنفحة التي لا اسم لها تظهر بالعربية. كل تعديل يُسجَّل في سجل القرارات.
          </p>
        </div>

        <OpsNav current="notes" />
      </header>

      <NoteGlossary rows={rows ?? []} />
    </main>
  );
}
