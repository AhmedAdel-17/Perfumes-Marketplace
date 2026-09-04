'use client';

/**
 * The pages a marketplace publishes, and the one control that makes a new one.
 *
 * A slug is a URL and a URL is forever, so creating a page is the only moment
 * it can be chosen — nothing here renames one. Editing a slug after publishing
 * breaks every link anyone ever shared, and an interface that offers the field
 * is an interface that says it is safe to change.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { PageState } from '@diyar/domain';
import { PrimaryButton } from '@/features/shell/PrimaryButton';
import { createPage } from './content-actions';

const STATE_LABELS: Record<PageState, string> = {
  draft: 'مسودة',
  in_review: 'قيد المراجعة',
  published: 'منشورة',
  archived: 'مؤرشفة',
};

export interface PageRow {
  id: string;
  slug: string;
  title: string;
  state: PageState;
  isLive: boolean;
}

export function ContentList({ pages }: { pages: PageRow[] }) {
  const router = useRouter();
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const create = () => startTransition(async () => {
    const result = await createPage(slug.trim(), title.trim());
    if (!result.ok) { setError(result.message ?? 'تعذّر الإنشاء.'); return; }
    setError(null);
    router.push(`/ops/content/${result.id}`);
  });

  return (
    <div className="px-5 lg:px-0">
      {pages.length === 0 ? (
        <p className="py-8 text-bodyLg text-dim">لا توجد صفحات بعد.</p>
      ) : (
        <ul className="border-t border-hair">
          {pages.map((page) => (
            <li key={page.id} className="border-b border-hair">
              <a
                href={`/ops/content/${page.id}`}
                className="tappable flex min-h-touch flex-wrap items-center justify-between gap-3 py-4 transition-colors duration-base ease-out hover:text-brass"
              >
                <span>
                  <span className="font-display text-bodyLg text-bone">{page.title}</span>
                  <span className="latin ms-3 text-caption text-faint">/{page.slug}</span>
                </span>
                <span className="flex items-center gap-2">
                  {/*
                    LIVE is a different fact from the state, and both are shown.
                    A page can read "مسودة" and still be on the site — somebody
                    is editing a published page — and an operator who saw only
                    the state would think it was down.
                  */}
                  {page.isLive && (
                    <span className="rounded-pill bg-brass/15 px-3 py-1 text-micro tracking-label text-brass">
                      على الموقع
                    </span>
                  )}
                  <span className="text-caption text-faint">{STATE_LABELS[page.state]}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {/*
        No top rule. The list already ends with one, and two rules forty pixels
        apart read as an empty row — which is what it looked like, with nothing
        in it.
      */}
      <section className="mt-10 pt-7">
        <h2 className="mb-4 font-display text-h4">صفحة جديدة</h2>

        <div className="mb-3">
          <label htmlFor="new-title" className="mb-1.5 block text-caption tracking-label text-faint">
            العنوان
          </label>
          <input
            id="new-title" value={title} maxLength={160}
            onChange={(e) => setTitle(e.target.value)}
            className="h-control w-full rounded-sm border border-hair bg-noir px-3 text-body text-bone transition-colors duration-base ease-out focus:border-dim focus:outline-none focus-visible:border-brass"
          />
        </div>

        <div className="mb-4">
          <label htmlFor="new-slug" className="mb-1.5 block text-caption tracking-label text-faint">
            المسار — حروف لاتينية صغيرة وشرطات، ولا يمكن تغييره لاحقًا
          </label>
          <input
            id="new-slug" value={slug} maxLength={80} dir="ltr"
            onChange={(e) => setSlug(e.target.value)}
            className="latin h-control w-full rounded-sm border border-hair bg-noir px-3 text-start text-body text-bone transition-colors duration-base ease-out focus:border-dim focus:outline-none focus-visible:border-brass"
          />
        </div>

        {error && <p role="alert" className="mb-4 text-small text-danger">{error}</p>}

        <PrimaryButton
          type="button" fill="auto" onClick={create}
          disabled={pending || slug.trim().length === 0 || title.trim().length === 0}
        >
          {pending ? '…' : 'إنشاء'}
        </PrimaryButton>
      </section>
    </div>
  );
}
