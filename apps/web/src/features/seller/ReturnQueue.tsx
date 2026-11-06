'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import type { ReturnState } from '@diyar/domain';
import { ReturnLifecycle } from '@diyar/domain';
import {
  COST_BEARER_AR, CURRENCY_LABEL, RETURN_REASON, RETURN_STATE, localePath,
  formatPrice, internal as num,
} from '@diyar/i18n';
import { PrimaryButton } from '@/features/shell/PrimaryButton';
import { useSellerOperationalCopy } from './operational-copy';
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
  { to: 'approved', label: "Approve return", tone: 'primary' },
  { to: 'declined', label: "Decline", tone: 'plain' },
  { to: 'in_transit', label: "On its way to us", tone: 'primary' },
  { to: 'received', label: "Mark as received", tone: 'primary' },
];

export function ReturnQueue() {
  const { locale, t, errorText } = useSellerOperationalCopy();
  const reasonLabels = RETURN_REASON[locale];
  const stateLabels = RETURN_STATE[locale];
  const [queue, setQueue] = useState<Queue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [pending, start] = useTransition();
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const next = await fetchReturnQueue();
      setExpired(next === null);
      setQueue(next);
    } catch {
      setLoadError(t("Returns could not be loaded. Check your connection and try again."));
    } finally { setLoading(false); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);

  if (expired) return <p role="alert" className="border border-line bg-raised p-6 text-body"> {t("Your session has expired.")} <a className="link-line" href={localePath(locale, '/seller')}> {t("Sign in again")} </a></p>;
  if (queue === null) return <div role="status" className="border border-line bg-raised p-6 text-body">{loadError ?? t("Loading returns…")}{loadError && <button type="button" disabled={loading} onClick={() => void load()} className="mt-4 block min-h-touch border border-line px-4"> {t("Try again")} </button>}</div>;

  const actionable = (row: Row) => SELLER_MOVES.some(move => ReturnLifecycle.can(row.state as ReturnState, move.to, 'seller'));
  const text = query.trim().toLocaleLowerCase('ar');
  const visible = queue.filter(row => (filter === 'all' || (filter === 'action' ? actionable(row) : row.state === filter)) && (!text || [row.subOrderReference, row.productName ?? '', reasonLabels[row.reason as keyof typeof reasonLabels] ?? row.reason].some(value => value.toLocaleLowerCase('ar').includes(text))));
  const act = (id: string, to: ReturnState) => {
    setError(null);
    start(async () => {
      try {
        const result = await decideReturn(id, to);
        if (!result.ok) setError(result.message);
        await load();
      } catch {
        setError(t("The result could not be confirmed. Refresh the list before trying again."));
      }
    });
  };

  return (
    <div aria-busy={loading || pending}>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[{ key: 'all', label: t("All returns"), count: queue.length }, { key: 'action', label: t("Needs your action"), count: queue.filter(actionable).length }, { key: 'received', label: t("Received"), count: queue.filter(row => row.state === 'received').length }, { key: 'refunded', label: t("Refunded"), count: queue.filter(row => row.state === 'refunded').length }].map(item => <button key={item.key} type="button" aria-pressed={filter === item.key} onClick={() => setFilter(item.key)} className={`min-h-touch border p-4 text-start ${filter === item.key ? 'border-accent bg-raised' : 'border-line bg-ground'}`}><span className="block text-small text-ink2">{item.label}</span><span className="tnum mt-2 block font-display text-h2 text-ink">{num(item.count)}</span></button>)}
      </div>
      <div className="mb-5 flex flex-wrap items-end gap-3 border border-line bg-raised p-4">
        <label className="min-w-0 flex-1 text-small text-ink2" htmlFor="seller-return-search"> {t("Search returns")} <input id="seller-return-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t("Order reference, product or reason")} className="mt-2 block min-h-touch w-full border border-line bg-ground px-3 text-body text-ink" /></label>
        <label className="text-small text-ink2" htmlFor="seller-return-filter"> {t("Return status")} <select id="seller-return-filter" value={filter} onChange={e => setFilter(e.target.value)} className="mt-2 block min-h-touch border border-line bg-ground px-3 text-body text-ink"><option value="all"> {t("All statuses")} </option><option value="action"> {t("Needs your action")} </option>{Object.entries(stateLabels).map(([state, label]) => <option key={state} value={state}>{label}</option>)}</select></label>
        <button type="button" disabled={loading || pending} onClick={() => void load()} className="min-h-touch border border-line px-4 text-body disabled:opacity-disabled">{loading ? t("Refreshing…") : t("Refresh list")}</button>
      </div>
      <p role="status" className="mb-4 text-small text-ink2"> {t("Results:")} <span className="tnum">{num(visible.length)}</span>  {t("· Counts cover the loaded orders.")} </p>
      {loadError && <div role="alert" className="mb-4 border border-danger bg-raised p-4 text-body">{errorText(loadError)}<button type="button" disabled={loading} onClick={() => void load()} className="ms-3 min-h-touch underline"> {t("Try again")} </button></div>}
      {error && (
        <p role="alert" className="mb-4 border border-danger bg-raised p-4 text-body text-ink">
          {errorText(error)}
        </p>
      )}

      <ul className="space-y-3">
        {visible.map((row: Row) => {
          const moves = SELLER_MOVES.filter((m) => ReturnLifecycle.can(row.state as ReturnState, m.to, 'seller'));

          return (
            <li key={row.id} className="border border-line bg-raised">
              <details>
                <summary className="min-h-touch cursor-pointer p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"><span className="inline-flex w-full flex-wrap items-center justify-between gap-3 align-middle"><span><span className="latin block text-small text-ink">{row.subOrderReference}</span><span className="mt-1 block text-body text-ink2">{row.productName ?? t("Entire order")}</span></span><span className="text-small text-accent">{stateLabels[row.state as keyof typeof stateLabels] ?? row.state}</span><span className="text-small text-ink2">{moves.length > 0 ? t("Needs your action · View details") : t("View details")}</span></span></summary>
              <div className="border-t border-line p-4 lg:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div>
                  <span className="text-small text-ink">{row.productName ?? t("Entire order")}</span>
                  <span className="latin ms-2 text-caption tracking-label text-ink3">
                    {row.subOrderReference}
                  </span>
                </div>
                <span className="text-small text-accent">
                  {stateLabels[row.state as keyof typeof stateLabels] ?? row.state}
                </span>
              </div>

              <p className="mt-2 text-small text-ink2">
                {reasonLabels[row.reason as keyof typeof reasonLabels] ?? row.reason}
                {' · '}
                {/* Who pays, stated up front. It is the part a house will argue
                    about, and hiding it until afterwards turns an argument into
                    a grievance. */}
                <span className="text-ink3">
                   {t("Cost borne by")} {t(COST_BEARER_AR[row.costBearer as keyof typeof COST_BEARER_AR] ?? row.costBearer)}
                </span>
              </p>

              {row.customerNote && (
                <p className="mt-2 max-w-proseMax border-s-2 border-line ps-3 text-small leading-relaxed text-ink2">
                  {row.customerNote}
                </p>
              )}

              {row.refundPiastres !== null && (
                <p className="mt-2 text-small text-ink3">
                   {t("Refund recorded:")} {' '}
                  <span className="tnum">{formatPrice(row.refundPiastres)}</span>
                  <span className="latin ms-1.5 text-micro tracking-label">{t(CURRENCY_LABEL)}</span>
                </p>
              )}

              <p className="mt-2 text-small text-ink3">
                 {t("Requested on")} {' '}
                <span className="tnum">
                  {new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'ar-EG-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Cairo' }).format(new Date(row.requestedAt))}
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
                      {pending ? '…' : t(move.label)}
                    </PrimaryButton>
                  ) : (
                    <button
                      key={move.to}
                      type="button"
                      disabled={pending}
                      onClick={() => act(row.id, move.to)}
                      className="tappable min-h-touch border-b border-line pb-1 text-small text-ink3 transition-colors duration-base ease-out hover:border-danger hover:text-danger"
                    >
                      {t(move.label)}
                    </button>
                  )))}
                </div>
              )}

              {moves.length === 0 && (
                <p className="mt-3 text-small text-ink3">
                  {/* Not a dead row: it says WHO it is waiting on. A queue that
                      shows a case with no actions and no explanation is a queue
                      a house stops reading. */}
                  {row.state === 'refunded' ? t("The platform has recorded the refund.") : row.state === 'received' ? t("Awaiting platform review and refund.") : t("No action is needed from you now.")}
                </p>
              )}
              </div>
              </details>
            </li>
          );
        })}
      </ul>

      {visible.length === 0 && <div className="border border-line bg-raised px-6 py-9 text-center text-body text-ink2"><p>{queue.length === 0 ? t("Your house has no return requests at the moment.") : t("No returns match your search or filter.")}</p>{queue.length > 0 && <button type="button" onClick={() => { setQuery(''); setFilter('all'); }} className="mt-3 min-h-touch border border-line px-4"> {t("Clear search and filters")} </button>}</div>}
      <p className="mt-6 text-small leading-relaxed text-ink3">
         {t("Requests:")} <span className="tnum">{num(queue.length)}</span> {t(". The platform handles refunds after the bottle is received and inspected.")} </p>
    </div>
  );
}
