/**
 * The draft, as a reader would meet it.
 *
 * Rendered with the SAME `Blocks` component and the same page chrome the public
 * route uses, because a preview that renders differently is a preview that
 * lies — and the whole point is to answer "does this read well" before anyone
 * else sees it.
 *
 * Platform-only, behind the ops session. The alternative is a signed preview
 * link, and links get forwarded: one that shows unpublished content leaks it
 * the first time somebody is being helpful.
 */
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { Blocks } from '@/features/content/Blocks';
import { activeOperator } from '@/features/ops/actions';
import { api } from '@/core/api';

export const metadata: Metadata = {
  title: 'معاينة | ديار',
  // Never indexed. A preview URL that reaches a search engine is unpublished
  // content published by accident, with the site's own authority behind it.
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = 'force-dynamic';

export default async function PreviewPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await activeOperator();
  if (!session) redirect('/ops');

  const { id } = await params;
  const page = await api(
    { role: 'platform', id: session.authUserId },
    null,
    { staffId: session.staffId, role: session.role },
  ).content.preview({ id }).catch(() => null);

  if (!page) notFound();

  return (
    <>
      {/*
        A standing reminder of what is being looked at.

        Without it a preview is indistinguishable from the live page, and the
        confusion runs in the dangerous direction: someone sees their change,
        believes it shipped, and stops.
      */}
      {/* On the raised surface, not a tint of accent: the accent ink is proven
          against the surfaces, and a tint is none of them. */}
      <div className="sticky top-0 z-10 border-b border-accent bg-raised px-5 py-2.5 text-center">
        <span className="text-small text-accent">
          معاينة المسودة — غير منشورة
        </span>
      </div>

      <SiteHeader />
      <main className="mx-auto max-w-phoneMax px-5 pb-9 lg:max-w-proseMax lg:px-0 lg:pb-[88px]">
        <h1 className="pb-2 pt-7 font-display text-h1 leading-heading lg:pb-3 lg:pt-9 lg:text-h1Lg">
          {page.title}
        </h1>
        <article className="pb-4">
          <Blocks blocks={page.blocks} images={page.images} locale="ar" />
        </article>

        <a
          href={`/ops/content/${id}`}
          className="tappable mt-10 flex min-h-touch items-center border-t border-ink pt-6 text-body text-ink2 transition-colors duration-base ease-out hover:text-accent"
        >
          {/* Back points to the reading start — right, in Arabic. */}
          <span className="link-line">→ العودة إلى التحرير</span>
        </a>
      </main>
    </>
  );
}
