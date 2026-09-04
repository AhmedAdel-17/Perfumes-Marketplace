import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { PageEditor } from '@/features/ops/PageEditor';
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
    { staffId: session.staffId, role: session.role },
  );

  const page = await caller.content.get({ id }).catch(() => null);
  if (!page) notFound();

  return (
    <main className="mx-auto max-w-phoneMax pb-9 lg:max-w-[760px] lg:px-8">
      <header className="px-5 pb-6 pt-9 lg:px-0">
        <a
          href="/ops/content"
          className="tappable mb-4 flex min-h-touch items-center text-caption tracking-label text-faint transition-colors duration-base ease-out hover:text-brass"
        >
          ← كل الصفحات
        </a>
        <h1 className="font-display text-h2 leading-heading lg:text-h1Lg">{page.title}</h1>
      </header>
      <PageEditor page={{ ...page, blocks: [...page.blocks] }} />
    </main>
  );
}
