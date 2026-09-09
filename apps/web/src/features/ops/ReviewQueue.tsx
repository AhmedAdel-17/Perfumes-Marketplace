'use client';

/**
 * The review moderation queue.
 *
 * ONE QUESTION PER ROW: is this abuse, or is it criticism? Doc 06 §10 draws
 * that line and this screen is where a person has to hold it, so the whole
 * review is on the row — every score and the full text — rather than a
 * truncated preview with a "view" link. A moderator who has to open a second
 * screen to read what they are deciding about decides from the headline.
 *
 * THERE IS NO DELETE BUTTON, AND THERE IS NO WAY TO ADD ONE. The repository has
 * no delete method, the RLS policies grant no DELETE to anybody, and hiding
 * requires a written reason that is stored on the row and copied into the audit
 * trail. Doc 04 §3: "Brands cannot delete or privately suppress negative
 * reviews" — this screen is what makes that sentence structural rather than a
 * promise.
 */
import { useState, useTransition } from 'react';
import { REVIEW_DIMENSIONS, formatRating, type Ratings } from '@diyar/domain';
import { REVIEW_DIMENSION_AR, data as num } from '@diyar/i18n';
import { PrimaryButton } from '@/features/shell/PrimaryButton';
import { hideReview, restoreReview } from './review-actions';

export interface ReviewRow {
  id: string;
  ratings: Ratings;
  body: string | null;
  authorName: string;
  createdAt: string;
  productId: string;
  productSlug: string;
  productName: string;
  brandName: string;
  hiddenAt: string | null;
  moderationNote: string | null;
}

export function ReviewQueue({ rows }: { rows: ReviewRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="px-5 py-10 text-bodyLg text-ink2 lg:px-0">
        لا توجد تقييمات بعد.
      </p>
    );
  }

  return (
    <ul className="px-5 lg:px-0">
      {rows.map((row) => <Entry key={row.id} row={row} />)}
    </ul>
  );
}

function Entry({ row }: { row: ReviewRow }) {
  const [pending, start] = useTransition();
  const [hidden, setHidden] = useState(row.hiddenAt !== null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const overall = REVIEW_DIMENSIONS.reduce((sum, d) => sum + row.ratings[d], 0)
    / REVIEW_DIMENSIONS.length;

  const act = (run: () => Promise<{ ok: boolean; message?: string }>, next: boolean) => {
    setError(null);
    start(async () => {
      const result = await run();
      if (result.ok) setHidden(next);
      else setError(result.message ?? 'تعذّر تنفيذ الإجراء.');
    });
  };

  return (
    <li className="border-t border-line py-6 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <a
            href={`/p/${row.productSlug}#reviews`}
            className="tappable inline-flex min-h-touch items-center text-small text-ink transition-colors duration-base ease-out hover:text-accent"
          >
            {row.productName}
          </a>
          <span className="text-caption text-ink3"> · {row.brandName}</span>
        </div>
        <span dir="ltr" className="tnum text-caption text-accent">
          {formatRating(overall)}
        </span>
      </div>

      <div className="mt-1 text-caption text-ink3">
        {row.authorName}
        {' · '}
        <time dateTime={row.createdAt}>
          {new Date(row.createdAt).toLocaleDateString('ar-EG', {
            year: 'numeric', month: 'long', day: 'numeric',
          })}
        </time>
        {hidden && <span className="text-danger"> · مخفي</span>}
      </div>

      {/* Every score, not the average. A house's problem is usually one
          dimension — most often "مطابقة الوصف" — and an average hides it. */}
      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
        {REVIEW_DIMENSIONS.map((dimension) => (
          <div key={dimension} className="flex items-baseline gap-1.5">
            <dt className="text-micro tracking-label text-ink3">
              {REVIEW_DIMENSION_AR[dimension]}
            </dt>
            <dd className="tnum text-caption text-ink2">{num(row.ratings[dimension])}</dd>
          </div>
        ))}
      </dl>

      {row.body && (
        <p className="mt-3 max-w-proseMax whitespace-pre-line text-small leading-relaxed text-ink2">
          {row.body}
        </p>
      )}

      {row.moderationNote && (
        <p className="mt-3 border-s-2 border-line ps-3 text-caption leading-relaxed text-ink3">
          سبب الإخفاء: {row.moderationNote}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-caption text-danger">{error}</p>
      )}

      {hidden ? (
        <div className="mt-4">
          <button
            type="button"
            disabled={pending}
            onClick={() => act(() => restoreReview(row.id), false)}
            className="tappable min-h-touch border-b border-accent/50 text-small transition-colors duration-base ease-out hover:border-accent hover:text-accent"
          >
            {pending ? '…' : 'إعادة إظهاره'}
          </button>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          {/*
            The reason is required by the router, by the domain and by the
            repository's WHERE clause — so the field is not politeness. It is
            the record of why a piece of criticism was removed, and it is the
            only thing separating moderation from suppression.
          */}
          <label className="min-w-[240px] flex-1">
            <span className="text-caption tracking-label text-ink3">سبب الإخفاء</span>
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              className="mt-1 block w-full border border-line bg-raised p-2.5 text-small text-ink outline-none transition-colors duration-base ease-out focus-visible:border-accent"
            />
          </label>

          <PrimaryButton
            type="button"
            fill="auto"
            disabled={pending || note.trim().length === 0}
            onClick={() => act(() => hideReview(row.id, note), true)}
          >
            {pending ? '…' : 'إخفاء'}
          </PrimaryButton>
        </div>
      )}
    </li>
  );
}
