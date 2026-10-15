import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { PageEditor } from '@/features/ops/PageEditor';
import { RevisionHistory } from '@/features/ops/RevisionHistory';
import { activeOperator } from '@/features/ops/actions';
import { api } from '@/core/api';

export const metadata: Metadata = {
  title: 'تحرير صفحة | ديار',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function OpsPageEditor(
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await activeOperator();
  if (!session) redirect('/ops');

  const { id } = await params;
  const caller = api(
    { role: 'platform', id: session.authUserId },
    null,
    { staffId: session.staffId, role: session.role, label: session.fullName },
  );

  const page = await caller.content.get({ id }).catch(() => null);
  if (!page) notFound();

  const revisions = await caller.content.history({ id });

  /*
    760px was the phone column with margins — a working tool rendered at just
    over half the monitor it is used on, with every row stretched to reach both
    of its edges. The console gets the content measure, and the lists inside it
    get columns so the extra width becomes room rather than distance.
    DESIGN_DOCTRINE §4b.
  */
  return (
    <main className="mx-auto max-w-phoneMax pb-9 lg:max-w-contentMax lg:px-8">
      <header className="mx-5 mb-6 border-b border-ink pb-3 pt-7 lg:mx-0 lg:mb-8 lg:pt-9">
        <a
          href="/ops/content"
          className="tappable mb-3 flex min-h-touch items-center text-body text-ink2 transition-colors duration-base ease-out hover:text-accent"
        >
          {/* Back points to the reading START — right, in Arabic. The glyph
              does not mirror itself, so the arrow is chosen for the direction. */}
          <span className="border-b border-current">→ كل الصفحات</span>
        </a>
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="font-display text-h2 leading-heading lg:text-h1">{page.title}</h1>
          {/*
            The preview is offered ALWAYS, not only once a page is live — an
            unpublished draft is exactly the thing nobody can otherwise see.
          */}
          <a
            href={`/ops/content/${id}/preview`}
            target="_blank"
            rel="noreferrer"
            className="tappable flex min-h-touch items-center text-small text-accent transition-opacity duration-base ease-out hover:opacity-press"
          >
            معاينة المسودة ↗
          </a>
        </div>
      </header>
      <PageEditor page={{ ...page, blocks: [...page.blocks], blocksEn: [...page.blocksEn] }} />
      <div className="px-5 lg:px-0">
        <RevisionHistory pageId={id} revisions={revisions} />
      </div>
    </main>
  );
}
