'use client';

import { useEffect, useState, useTransition } from 'react';
import type { ReturnState } from '@diyar/domain';
import { ReturnLifecycle } from '@diyar/domain';
import {
  COST_BEARER_AR, CURRENCY_LABEL, RETURN_REASON_AR, RETURN_STATE_AR,
  formatPrice, internal as num,
} from '@diyar/i18n';
import { PrimaryButton } from '@/features/shell/PrimaryButton';
import { decideReturn, fetchReturnQueue } from './return-actions';

type Queue = NonNullable<Awaited<ReturnType<typeof fetchReturnQueue>>>;
type Row = Queue[number];

/**
 * Returns, as the house sees them.
 *
 * ONE DECISION PER ROW, and the row carries what the decision needs: which
 * bottle, which parcel, what the customer says is wrong, and who the platform
 * proposes should bear the cost. The cost bearer is on the row rather than
 * buried, because it is the part a house will argue about and hiding it until
 * afterwards is how an argument becomes a grievance.
 *
 * THE ACTIONS OFFERED ARE THE ONES THE DOMAIN ALLOWS. They are not a fixed list
 * of buttons with some greyed out: `ReturnLifecycle` is asked what a seller may
 * do from this state, and the answer is rendered. A button that exists and does
 * nothing is the fault this project has already shipped once, on a decline
 * reason that was in the UI and in no rule anywhere.
 */
const SELLER_MOVES: readonly { to: ReturnState; label: string; tone: 'primary' | 'plain' }[] = [
  { to: 'approved', label: 'وافق على الإرجاع', tone: 'primary' },
  { to: 'declined', label: 'ارفض', tone: 'plain' },
  { to: 'in_transit', label: 'في الطريق إلينا', tone: 'primary' },
  { to: 'received', label: 'استلمت العبوة', tone: 'primary' },
];

export function ReturnQueue() {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const load = async () => setQueue(await fetchReturnQueue());
  useEffect(() => { void load(); }, []);

  if (queue === null) {
    return <p className="px-5 py-10 text-bodyLg text-ink3 lg:px-0">…جارٍ التحميل</p>;
  }

  if (queue.length === 0) {
    return (
      <p className="px-5 py-10 text-bodyLg text-ink2 lg:px-0">
        لا توجد طلبات إرجاع.
      </p>
    );
  }

  const act = (id: string, to: ReturnState) => {
    setError(null);
    start(async () => {
      const result = await decideReturn(id, to);
      if (!result.ok) setError(result.message);
      await load();
    });
  };

  return (
    <>
      {error && (
        <p role="alert" className="mx-5 mb-4 border border-line bg-raised p-3 text-small text-danger lg:mx-0">
          {error}
        </p>
      )}

      <ul className="px-5 lg:px-0">
        {queue.map((row: Row) => {
          const moves = SELLER_MOVES.filter((m) => ReturnLifecycle.can(row.state as ReturnState, m.to, 'seller'));

          return (
            <li key={row.id} className="border-t border-line py-6 first:border-t-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div>
                  <span className="text-small text-ink">{row.productName ?? 'الطلب كاملًا'}</span>
                  <span className="latin ms-2 text-caption tracking-label text-ink3">
                    {row.subOrderReference}
                  </span>
                </div>
                <span className="text-caption text-accent">
                  {RETURN_STATE_AR[row.state as keyof typeof RETURN_STATE_AR] ?? row.state}
                </span>
              </div>

              <p className="mt-2 text-small text-ink2">
                {RETURN_REASON_AR[row.reason as keyof typeof RETURN_REASON_AR] ?? row.reason}
                {' · '}
                {/* Who pays, stated up front. It is the part a house will argue
                    about, and hiding it until afterwards turns an argument into
                    a grievance. */}
                <span className="text-ink3">
                  التكلفة على {COST_BEARER_AR[row.costBearer as keyof typeof COST_BEARER_AR] ?? row.costBearer}
                </span>
              </p>

              {row.customerNote && (
                <p className="mt-2 max-w-proseMax border-s-2 border-line ps-3 text-small leading-relaxed text-ink2">
                  {row.customerNote}
                </p>
              )}

              {row.refundPiastres !== null && (
                <p className="mt-2 text-caption text-ink3">
                  رُدّ للعميل{' '}
                  <span className="tnum">{formatPrice(row.refundPiastres)}</span>
                  <span className="latin ms-1.5 text-micro tracking-label">{CURRENCY_LABEL}</span>
                </p>
              )}

              <p className="mt-2 text-micro text-ink3">
                طُلب في{' '}
                <span className="tnum">
                  {new Date(row.requestedAt).toLocaleDateString('ar-EG', {
                    year: 'numeric', month: 'long', day: 'numeric',
                  })}
                </span>
              </p>

              {moves.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-3">
                  {moves.map((move) => (move.tone === 'primary' ? (
                    <PrimaryButton
                      key={move.to}
                      type="button"
                      fill="auto"
                      disabled={pending}
                      onClick={() => act(row.id, move.to)}
                    >
                      {pending ? '…' : move.label}
                    </PrimaryButton>
                  ) : (
                    <button
                      key={move.to}
                      type="button"
                      disabled={pending}
                      onClick={() => act(row.id, move.to)}
                      className="tappable min-h-touch border-b border-line pb-1 text-small text-ink3 transition-colors duration-base ease-out hover:border-danger hover:text-danger"
                    >
                      {move.label}
                    </button>
                  )))}
                </div>
              )}

              {moves.length === 0 && (
                <p className="mt-3 text-caption text-ink3">
                  {/* Not a dead row: it says WHO it is waiting on. A queue that
                      shows a case with no actions and no explanation is a queue
                      a house stops reading. */}
                  {row.state === 'received' || row.state === 'refunded'
                    ? 'المنصّة تتولّى ردّ المبلغ.'
                    : 'لا إجراء مطلوب منك الآن.'}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-6 px-5 text-caption leading-relaxed text-ink3 lg:px-0">
        عدد الطلبات <span className="tnum">{num(queue.length)}</span>. ردّ المبلغ إجراء تقوم به
        المنصّة بعد استلام العبوة وفحصها.
      </p>
    </>
  );
}
