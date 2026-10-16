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
import { PAGE_STATE_AR } from '@diyar/i18n';
import { PrimaryButton } from '@/features/shell/PrimaryButton';
import { statusPill } from '@/features/shell/status-pill';
import { createPage } from './content-actions';

// Shared with the page editor and the audit screen; typed against the domain
// union so a new state cannot arrive without its word.
const STATE_LABELS: Record<PageState, string> = PAGE_STATE_AR;

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
        <p className="py-8 text-bodyLg text-ink2">لا توجد صفحات بعد.</p>
      ) : (
        /*
          COLUMNS, not a row pushed to both edges.

          `justify-between` is the correct answer on a phone and the wrong one
          on a monitor: at 1240px it put the state 480 pixels from the title it
          describes, with nothing in between, and the eye cannot carry a pair
          that far apart. A grid gives every field a column, so widening the
          console adds ROOM rather than distance — which is the difference
          §4b is about.
        */
        <ul className="border-t border-line">
          {/* A header row is what makes the columns readable as columns. It is
              presentational, so it is aria-hidden and each cell below still
              reads as its own labelled fact. */}
          <li
            aria-hidden
            className="hidden border-b border-line py-2 text-small text-ink3 lg:grid lg:grid-cols-[1fr_18ch_11ch_9ch] lg:items-center lg:gap-6"
          >
            <span>العنوان</span>
            <span className="latin">PATH</span>
            <span>على الموقع</span>
            <span>الحالة</span>
          </li>
          {pages.map((page) => (
            <li key={page.id} className="border-b border-line">
              <a
                href={`/ops/content/${page.id}`}
                className="tappable flex min-h-touch flex-wrap items-center justify-between gap-3 py-4 transition-colors duration-base ease-out hover:text-accent lg:grid lg:grid-cols-[1fr_18ch_11ch_9ch] lg:items-center lg:gap-6"
              >
                <span className="font-display text-bodyLg text-ink">{page.title}</span>
                <span className="latin text-caption text-ink3 lg:truncate">/{page.slug}</span>
                {/*
                  LIVE is a different fact from the state, and both are shown.
                  A page can read "مسودة" and still be on the site — somebody is
                  editing a published page — and an operator who saw only the
                  state would think it was down.
                */}
                <span>
                  {page.isLive && (
                    <span className={statusPill('accent')}>
                      على الموقع
                    </span>
                  )}
                </span>
                <span className="text-small text-ink3">{STATE_LABELS[page.state]}</span>
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
          <label htmlFor="new-title" className="mb-1.5 block text-small text-ink3">
            العنوان
          </label>
          <input
            id="new-title" value={title} maxLength={160}
            onChange={(e) => setTitle(e.target.value)}
            className="h-control w-full border border-line bg-sunken px-3 text-body text-ink transition-colors duration-base ease-out focus:border-ink focus:outline-none"
          />
        </div>

        <div className="mb-4">
          <label htmlFor="new-slug" className="mb-1.5 block text-small text-ink3">
            المسار — حروف لاتينية صغيرة وشرطات، ولا يمكن تغييره لاحقًا
          </label>
          <input
            id="new-slug" value={slug} maxLength={80} dir="ltr"
            onChange={(e) => setSlug(e.target.value)}
            className="latin h-control w-full border border-line bg-sunken px-3 text-start text-body text-ink transition-colors duration-base ease-out focus:border-ink focus:outline-none"
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
