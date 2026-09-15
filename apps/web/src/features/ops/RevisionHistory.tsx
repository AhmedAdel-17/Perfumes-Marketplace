'use client';

/**
 * What this page has published, and the way back to any of it.
 *
 * The revisions are immutable and have been since the first publish; until now
 * nothing showed them, which made the guarantee true and useless. A history
 * nobody can read is a backup nobody has tested.
 *
 * RESTORING DOES NOT PUBLISH. It loads the old text into the draft and stops,
 * so putting it back on the site is a second, deliberate act by someone allowed
 * to make it. An undo button that reaches the public in one press is the same
 * hazard publishing exists to prevent, wearing a friendlier label.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BLOCK, counted, data as num } from '@diyar/i18n';
import { statusPill } from '@/features/shell/status-pill';
import { restoreRevision } from './content-actions';

export interface Revision {
  id: string;
  title: string;
  publishedAt: string;
  blockCount: number;
  isServing: boolean;
}

/**
 * A date an operator can match against their own memory of the week.
 *
 * Western digits: doc 02's rule is that anything scannable or comparable is
 * data, and a console is an operating tool. The Gregorian month name is spelled
 * out because `٤/٣` is ambiguous in a country that reads both orders.
 */
const MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

function published(iso: string): string {
  const at = new Date(iso);
  const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  return `${num(at.getDate())} ${MONTHS[at.getMonth()]} ${num(at.getFullYear(), false)} · ${time}`;
}

export function RevisionHistory({ pageId, revisions }: {
  pageId: string;
  revisions: Revision[];
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (revisions.length === 0) {
    return (
      <section className="mt-12 border-t border-line pt-7">
        <h2 className="mb-3 font-display text-h4">السجل</h2>
        <p className="text-small text-ink3">لم تُنشر هذه الصفحة بعد.</p>
      </section>
    );
  }

  const restore = (revisionId: string) => startTransition(async () => {
    const result = await restoreRevision(pageId, revisionId);
    if (!result.ok) { setMessage(result.message ?? 'تعذّر الاسترجاع.'); return; }
    setMessage(null);
    setConfirming(null);
    // The editor above is holding the OLD draft in its own state, so the whole
    // route is re-rendered rather than patched — a restore that left stale text
    // in the editor would be worse than no restore at all.
    router.refresh();
  });

  return (
    <section className="mt-12 border-t border-line pt-7">
      <h2 className="mb-1 font-display text-h4">السجل</h2>
      <p className="mb-5 text-caption leading-relaxed text-ink3">
        الاسترجاع ينقل النسخة إلى المسودة فقط. لا يُنشر شيء حتى تختار النشر.
      </p>

      <ul className="border-t border-line">
        {revisions.map((revision) => (
          <li key={revision.id} className="border-b border-line py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <div className="text-body text-ink">{revision.title}</div>
                <div className="mt-1 text-caption text-ink3">
                  <span className="tnum">{published(revision.publishedAt)}</span>
                  {' · '}
                  {/*
                    Through `counted`, not a numeral glued to a noun. Eight
                    blocks is "٨ عناصر"; the accusative singular this used to
                    print is the form for eleven and up.
                  */}
                  <span className="tnum">{counted(revision.blockCount, BLOCK, num)}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {revision.isServing && (
                  // Which one the visitor is reading, stated rather than
                  // inferred from position — the top row stops being the live
                  // one the moment anything is rolled back.
                  <span className={statusPill('accent')}>
                    على الموقع الآن
                  </span>
                )}

                {confirming === revision.id ? (
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => restore(revision.id)}
                      className="tappable flex min-h-touch items-center rounded-sm border border-accent px-4 text-small text-accent transition-opacity duration-base ease-out disabled:opacity-disabled"
                    >
                      {pending ? '…' : 'تأكيد الاسترجاع'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      className="tappable flex min-h-touch min-w-touch items-center justify-center text-caption text-ink3 transition-colors duration-base ease-out hover:text-ink"
                    >
                      إلغاء
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    // Two presses, because restoring DISCARDS whatever is
                    // currently in the draft. That is unrecoverable — the draft
                    // was never a revision — and a single click next to a date
                    // is too easy to hit while reading.
                    onClick={() => { setConfirming(revision.id); setMessage(null); }}
                    className="tappable flex min-h-touch items-center text-caption tracking-label text-ink2 transition-colors duration-base ease-out hover:text-accent"
                  >
                    استرجاع
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {message && <p role="alert" className="mt-4 text-small text-danger">{message}</p>}
    </section>
  );
}
