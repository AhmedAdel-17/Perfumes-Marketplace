'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CURRENCY_LABEL, formatPrice, GOVERNORATE, localePath, REASON_CODE_AR, stateCopy, internal as num,
} from '@diyar/i18n';
import { confirmSubOrder, declineSubOrder, dispatchSubOrder, fetchQueue } from './actions';
import { PrimaryButton } from '@/features/shell/PrimaryButton';
import { useSellerOperationalCopy } from './operational-copy';
import { statusPill } from '@/features/shell/status-pill';
import { REJECTION_REASONS } from '@diyar/domain';

type Queue = NonNullable<Awaited<ReturnType<typeof fetchQueue>>>;
type Entry = Queue[number];

/**
 * Master-detail work queue: summaries and filters support scanning; native
 * a selected detail pane retains fulfilment actions without a wall of addresses.
 * Counts describe the loaded queue, never revenue or inferred business states.
 */
export function OrderQueue() {
  const { locale, t, errorText } = useSellerOperationalCopy();
  const [queue, setQueue] = useState<Queue | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailRef = useRef<HTMLElement>(null);
  const acting = useRef(false);
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const next = await fetchQueue();
      setExpired(next === null);
      setQueue(next);
    } catch {
      setLoadError(t("Orders could not be loaded. Check your connection and try again."));
    } finally { setLoading(false); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const openHash = () => {
      const hash = window.location.hash;
      const entry = queue?.find(item => hash === `#order-${item.id}`);
      if (entry) { setSelectedId(entry.id); setQuery(''); setFilter('all'); }
    };
    openHash();
    window.addEventListener('hashchange', openHash);
    return () => window.removeEventListener('hashchange', openHash);
  }, [queue]);
  useEffect(() => {
    if (selectedId) detailRef.current?.focus();
  }, [selectedId]);
  const openOrder = (id: string) => {
    setSelectedId(id);
    window.history.replaceState(null, '', `#order-${id}`);
  };
  const closeOrder = () => {
    const previous = selectedId;
    setSelectedId(null);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    if (previous) document.getElementById(`open-order-${previous}`)?.focus();
  };

  const act = async (id: string, run: () => Promise<{ ok: boolean; message?: string }>) => {
    if (acting.current) return;
    acting.current = true;
    setBusyId(id);
    setError(null);
    try {
      const result = await run();
      if (!result.ok) setError(result.message ?? t("Could not complete the action."));
      await load();
    } catch {
      setError(t("The result could not be confirmed. Refresh orders before trying again."));
    } finally { acting.current = false; setBusyId(null); }
  };

  if (expired) return <p role="alert" className="border border-line bg-raised p-6 text-body"> {t("Your session has expired.")} <a className="link-line" href={localePath(locale, '/seller')}> {t("Sign in again")} </a></p>;
  if (queue === null) return <div role="status" className="border border-line bg-raised p-6 text-body">{loadError ?? t("Loading orders…")}{loadError && <button type="button" onClick={() => void load()} disabled={loading} className="mt-4 block min-h-touch border border-line px-4"> {t("Try again")} </button>}</div>;

  const deciding = (e: Entry) => e.state === 'placed' || e.state === 'awaiting_seller';
  const filters = [
    { key: 'all', label: t("All orders"), count: queue.length },
    { key: 'decide', label: t("Awaiting confirmation"), count: queue.filter(deciding).length },
    { key: 'ship', label: t("Ready to ship"), count: queue.filter(e => e.state === 'confirmed').length },
    { key: 'dispatched', label: t("In delivery"), count: queue.filter(e => e.state === 'dispatched').length },
    { key: 'delivered', label: t("Delivered"), count: queue.filter(e => e.state === 'delivered').length },
    ...Array.from(new Set(queue.map(e => e.state))).filter(state => !['placed', 'awaiting_seller', 'confirmed', 'dispatched', 'delivered'].includes(state)).map(state => ({ key: state, label: stateCopy(state, locale).label, count: queue.filter(e => e.state === state).length })),
  ];
  const text = query.trim().toLocaleLowerCase('ar');
  const visible = queue.filter(e => (filter === 'all' || (filter === 'decide' ? deciding(e) : filter === 'ship' ? e.state === 'confirmed' : e.state === filter)) && (!text || [e.reference, e.recipient.name, e.trackingNumber ?? '', ...e.items.map(item => item.name)].some(value => value.toLocaleLowerCase('ar').includes(text))));
  const selected = queue.find(entry => entry.id === selectedId);
  const date = (value: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'ar-EG', { day: 'numeric', month: 'short', timeZone: 'Africa/Cairo' }).format(new Date(value));

  return <div aria-busy={loading || busyId !== null}>
    <nav aria-label={t("Filter orders by status")} className="mb-5 flex flex-wrap gap-2 border-b border-line pb-4">
      {filters.map(item => <button key={item.key} type="button" aria-pressed={filter === item.key} onClick={() => setFilter(item.key)} className={`min-h-touch border px-4 py-2 text-small ${filter === item.key ? 'border-accent bg-raised text-accent' : 'border-line bg-ground text-ink2'}`}>{item.label}<span className="tnum ms-2">{num(item.count)}</span></button>)}
    </nav>
    <div className="mb-5 flex flex-wrap items-end gap-3 border border-line bg-raised p-4">
      <label className="w-full min-w-0 flex-1 text-small text-ink2" htmlFor="seller-order-search"> {t("Search orders")} <input id="seller-order-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t("Order reference, customer or product")} className="mt-2 block min-h-touch w-full border border-line bg-ground px-3 text-body text-ink" /></label>
      <label className="text-small text-ink2" htmlFor="seller-order-filter"> {t("Order status")} <select id="seller-order-filter" value={filter} onChange={e => setFilter(e.target.value)} className="mt-2 block min-h-touch border border-line bg-ground px-3 text-body text-ink">{filters.map(item => <option key={item.key} value={item.key}>{item.label} ({num(item.count)})</option>)}</select></label>
      <button type="button" disabled={loading || busyId !== null} onClick={() => void load()} className="min-h-touch border border-line px-4 text-body disabled:opacity-disabled">{loading ? t("Refreshing…") : t("Refresh orders")}</button>
    </div>
    <p role="status" className="mb-4 text-small text-ink2"> {t("Results:")} <span className="tnum">{num(visible.length)}</span>  {t("· Counts cover the loaded orders.")} </p>
    {(error || loadError) && <div role="alert" className="mb-6 border border-danger bg-raised p-4 text-body text-ink">{errorText(error ?? loadError ?? '')}{loadError && <button type="button" disabled={loading} onClick={() => void load()} className="ms-3 min-h-touch underline"> {t("Try again")} </button>}</div>}
    <div className={`grid items-start gap-5 ${selected ? 'xl:grid-cols-3' : ''}`}>
      <div className={`min-w-0 border border-line bg-raised ${selected ? 'xl:col-span-2' : ''}`}>
        <table className="w-full text-start text-small">
          <caption className="border-b border-line px-4 py-3 text-start text-body text-ink"> {t("Order register")} <span className="text-small text-ink2"> {t("· Select an order for details and actions")} </span></caption>
          <thead className="hidden border-b border-line bg-sunken text-ink2 lg:table-header-group"><tr>{[t("Order and customer"), t("Date"), t("Bottles"), t("Total"), t("Status"), t("Action")].map(label => <th key={label} scope="col" className="px-3 py-3 text-start font-medium">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">{visible.map(entry => <tr key={entry.id} id={`order-${entry.id}`} className={`grid grid-cols-2 gap-3 p-4 lg:table-row lg:p-0 ${selectedId === entry.id ? 'bg-sunken' : ''}`}>
            <td className="col-span-2 min-w-0 lg:px-3 lg:py-4"><span dir="ltr" className="latin block break-all text-small text-ink">{entry.reference}</span><span className="mt-1 block break-words text-small text-ink2">{entry.recipient.name}</span></td>
            <td className="text-ink2 lg:px-3 lg:py-4"><span className="me-2 lg:hidden"> {t("Date")} </span><span className="tnum">{date(entry.placedAt)}</span></td>
            <td className="text-ink2 lg:px-3 lg:py-4"><span className="me-2 lg:hidden"> {t("Bottles")} </span><span className="tnum">{num(entry.items.reduce((total, item) => total + item.quantity, 0))}</span></td>
            <td className="text-ink lg:px-3 lg:py-4"><span className="me-2 lg:hidden"> {t("Total")} </span><span className="tnum">{formatPrice(entry.merchandisePiastres + entry.shippingPiastres)}</span> <span className="latin text-caption">{t(CURRENCY_LABEL)}</span></td>
            <td className="lg:px-3 lg:py-4"><span className={statusPill('quiet')}>{stateCopy(entry.state, locale).label}</span></td>
            <td className="col-span-2 lg:px-3 lg:py-4"><button id={`open-order-${entry.id}`} type="button" aria-expanded={selectedId === entry.id} aria-controls="seller-order-detail" onClick={() => openOrder(entry.id)} className="min-h-touch border border-line px-3 text-small text-accent">{deciding(entry) ? t("Review and confirm") : entry.state === 'confirmed' ? t("Prepare and dispatch") : t("Details")}</button></td>
          </tr>)}</tbody>
        </table>
      </div>
      {selected && <aside id="seller-order-detail" ref={detailRef} tabIndex={-1} aria-labelledby="seller-order-detail-heading" className="min-w-0 border border-line bg-raised focus:outline-none">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4"><h2 id="seller-order-detail-heading" className="font-display text-h3"> {t("Order details")} </h2><button type="button" onClick={closeOrder} className="min-h-touch border border-line px-3 text-small text-ink2"> {t("Close details")} </button></div>
        <Row key={selected.id} entry={selected} busy={busyId === selected.id} locked={busyId !== null} act={act} stage={deciding(selected) ? 'decide' : selected.state === 'confirmed' ? 'ship' : 'done'} />
      </aside>}
    </div>
    {visible.length === 0 && <div className="border border-line bg-raised px-6 py-9 text-center text-body text-ink2"><p>{queue.length === 0 ? t("Your house orders will appear here when the first order arrives.") : t("No orders match your search or filter.")}</p>{queue.length > 0 && <button type="button" onClick={() => { setQuery(''); setFilter('all'); }} className="mt-3 min-h-touch border border-line px-4"> {t("Clear search and filters")} </button>}</div>}
  </div>;
}

type Stage = 'decide' | 'ship' | 'done';

function Row({
  entry, busy, locked, act, stage,
}: {
  entry: Entry;
  busy: boolean;
  locked: boolean;
  act(id: string, run: () => Promise<{ ok: boolean; message?: string }>): Promise<void>;
  stage: Stage;
}) {
  const { locale, t } = useSellerOperationalCopy();
  const [declining, setDeclining] = useState(false);
  const [tracking, setTracking] = useState('');
  const copy = stateCopy(entry.state, locale);
  const r = entry.recipient;

  return (
    <section>
      {/*
        The card is read in the order the work happens: how long is left, what
        to put in the box, where it goes. The reference is the least urgent
        thing on it and used to be the most prominent.
      */}
      {/* The card's head bar, ruled at full strength like a specimen label:
          the clock it is racing, and its reference. */}
      <header className="flex items-center justify-between gap-3 border-b border-ink px-4 py-2 lg:px-5">
        <Countdown
          confirmDueAt={entry.confirmDueAt}
          dispatchDueAt={entry.dispatchDueAt}
          state={entry.state}
        />
        <span className="latin select-all text-caption tracking-label text-ink2">{entry.reference}</span>
      </header>

      <div className="p-4 lg:p-5">

      {/* What goes in the box — the largest thing on the card, because it is
          what the person holding it is looking for. */}
      <ul>
        {entry.items.map((item) => (
          <li key={item.sku} className="flex items-baseline justify-between gap-3 py-1.5">
            <span className="font-display text-h4">
              {item.name}
              <span className="ms-2 text-small text-ink3">
                <span className="tnum">{num(item.volumeMl)}</span>  {t("ml")} </span>
            </span>
            <span className="flex items-baseline gap-2">
              {item.quantity > 1 && (
                /*
                  The number that tells a house HOW MANY to pack, so the most
                  legible thing on the row: ink, in a ruled square. It was once
                  accent text on an accent tint, which measured 4.32:1 — under
                  the floor, and never caught because no fixture had a line
                  with more than one bottle until a seeded order did.
                */
                <span className="border border-ink px-2 py-0.5 text-body text-ink">
                  <span className="tnum">×{num(item.quantity)}</span>
                </span>
              )}
              <span className="latin text-caption tracking-label text-ink3">{item.sku}</span>
            </span>
          </li>
        ))}
      </ul>

      {/*
        Everything needed to pack and label, on the row — a house that has to
        open a second screen to find the address will keep a paper notebook.

        The NAME AND PHONE are the brightest part of this block, because the
        single most common action a house takes on an order is ringing the
        customer before dispatch, and the address is read once at the label
        printer.
      */}
      <div className="mt-4 border-t border-line pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="text-bodyLg text-ink">{r.name}</span>
          <a
            href={`tel:${r.phone}`}
            className="tappable latin tnum flex min-h-touch items-center text-bodyLg text-accent transition-opacity duration-base ease-out hover:opacity-press"
          >
            {r.phone}
          </a>
        </div>

        <address className="mt-2 text-body not-italic leading-relaxed text-ink2">
          {r.building} {r.street}
          {r.floor && <>  {t("· Floor")} <span className="tnum">{r.floor}</span></>}
          {r.apartment && <>  {t("· Apartment")} <span className="tnum">{r.apartment}</span></>}
          <br />
          {r.area} · {r.city} · {GOVERNORATE[locale][r.governorate as keyof typeof GOVERNORATE.ar] ?? r.governorate}
          {r.landmark && (
            <>
              <br />
              <span className="text-ink3"> {t("Landmark:")} {r.landmark}</span>
            </>
          )}
        </address>
      </div>

      <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
        {/* The state is Arabic: no tracking (CLAUDE.md §15). */}
        <span className={statusPill('quiet')}>{copy.label}</span>
        <span className="text-bodyLg">
          <span className="tnum">{formatPrice(entry.merchandisePiastres + entry.shippingPiastres)}</span>
          <span className="latin ms-1.5 text-micro tracking-label text-ink2">{t(CURRENCY_LABEL)}</span>
        </span>
      </div>

      {entry.trackingNumber && (
        <div className="mt-3 flex justify-between border-t border-line pt-3 text-body">
          <span className="text-ink3"> {t("Tracking number")} </span>
          <span className="latin tnum select-all text-ink">{entry.trackingNumber}</span>
        </div>
      )}

      {stage === 'ship' && (
        <div className="mt-4 border-t border-line pt-4">
          <label className="mb-2 block text-body text-ink2" htmlFor={`t-${entry.id}`}>
             {t("Courier tracking number")} </label>
          <div className="flex gap-3">
            <input
              id={`t-${entry.id}`}
              value={tracking}
              onChange={(event) => setTracking(event.target.value)}
              inputMode="text"
              autoComplete="off"
              className="latin h-control min-w-0 flex-1 border border-line bg-sunken px-4 text-bodyLg text-ink transition-colors duration-base ease-out focus:border-ink focus:outline-none"
            />
            <PrimaryButton type="button" disabled={locked || tracking.trim().length < 4} onClick={() => act(entry.id, () => dispatchSubOrder(entry.id, tracking))} fill="auto">
      {busy ? '…' : t("Mark as dispatched")}
    </PrimaryButton>
          </div>
          <p className="mt-2 text-small leading-relaxed text-ink3">
             {t("Enter the number exactly as shown on the shipping label. The customer will see it on their tracking page.")} </p>
        </div>
      )}

      {stage === 'decide' && !declining && (
        <div className="mt-4 flex gap-3">
          <PrimaryButton type="button" disabled={locked} onClick={() => act(entry.id, () => confirmSubOrder(entry.id))} fill="flex">
      {busy ? '…' : t("Confirm")}
    </PrimaryButton>
          <button
            type="button"
            disabled={locked}
            onClick={() => setDeclining(true)}
            className="flex h-control min-w-[120px] items-center justify-center border border-ink px-6 text-bodyLg text-ink transition-colors duration-base ease-out hover:border-danger hover:text-danger"
          >
             {t("Decline")} </button>
        </div>
      )}

      {stage === 'decide' && declining && <DeclineReasons entry={entry} busy={locked} act={act} onCancel={() => setDeclining(false)} />}
      </div>
    </section>
  );
}

/**
 * Declining requires a CODED reason, never free text.
 *
 * Doc 06 §7: cost has to be allocated to a documented party. A free-text box
 * produces "sorry" a thousand times and nothing that can be counted, so the
 * platform never learns which houses run out of stock and which simply do not
 * open the app.
 */
/**
 * The CODES come from the domain; only the wording lives here.
 *
 * This list used to be retyped, and had drifted: it offered
 * `cannot_fulfil_sla`, which is not in the domain vocabulary, not in the
 * database enum, and not accepted by the schema. The button rendered, the house
 * pressed it, and the decline was refused — a dead control on the one screen
 * where a house says no.
 *
 * Typing the labels as a full Record means the compiler now refuses to build if
 * a reason gains a code with no wording, or keeps wording for a code that no
 * longer exists. The list cannot drift again without failing the typecheck.
 */
const REASON_LABELS: Record<(typeof REJECTION_REASONS)[number], string> = REASON_CODE_AR;

const REASONS = REJECTION_REASONS.map((value) => ({ value, label: REASON_LABELS[value] }));

function DeclineReasons({
  entry, busy, act, onCancel,
}: {
  entry: Entry;
  busy: boolean;
  act(id: string, run: () => Promise<{ ok: boolean; message?: string }>): Promise<void>;
  onCancel(): void;
}) {
  const { t } = useSellerOperationalCopy();
  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="mb-3 text-body text-ink2"> {t("Choose a specific reason:")} </p>
      <div className="flex flex-wrap gap-2">
        {REASONS.map((reason) => (
          <button
            key={reason.value}
            type="button"
            disabled={busy}
            onClick={() => act(entry.id, () => declineSubOrder(entry.id, reason.value))}
            className="tappable flex min-h-touch items-center border border-line bg-ground px-4 text-body text-ink transition-colors duration-base ease-out hover:border-danger hover:text-danger disabled:opacity-disabled"
          >
            {t(reason.label)}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="tappable mt-4 flex min-h-touch items-center text-body text-ink2 transition-colors duration-base ease-out hover:text-ink"
      >
        <span className="link-line"> {t("Back")} </span>
      </button>
    </div>
  );
}

/**
 * The deadline the order is racing, as time remaining rather than a timestamp.
 *
 * "18:40" requires the reader to know what time it is now and do subtraction;
 * "متبقٍ ٣ ساعات" does not. It turns amber under an hour and red once it has
 * passed, because a breached SLA has to look different from a tight one.
 *
 * NOT BY COLOUR ALONE. Under an hour also prints an "عاجل" stamp: in Noir the
 * accent IS the ink (bone on black), so the amber step was invisible in the
 * dark theme, and colour is never allowed to carry meaning on its own anyway.
 * Overdue already says so in words ("تأخّر").
 *
 * TWO CLOCKS. Confirmation while the order waits for the house; dispatch once
 * it is confirmed. The second was never shown — the column behind it had never
 * been written (migration 0020) — so the card in the shipping step, the one a
 * packer is working from, was the only card with no deadline on it. The label
 * names which clock, because "٣ ساعات" on a card that has already been
 * confirmed is ambiguous in exactly the way that gets a parcel shipped late.
 */
function Countdown({ confirmDueAt, dispatchDueAt, state }: {
  confirmDueAt: string | null;
  dispatchDueAt: string | null;
  state: string;
}) {
  const { t } = useSellerOperationalCopy();
  const [now, setNow] = useState(() => Date.now());

  const deciding = state === 'placed' || state === 'awaiting_seller';
  const shipping = state === 'confirmed';
  const dueAt = deciding ? confirmDueAt : shipping ? dispatchDueAt : null;

  useEffect(() => {
    if (!deciding && !shipping) return;
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [deciding, shipping]);

  if (!dueAt) return null;

  const remaining = new Date(dueAt).getTime() - now;
  if (!Number.isFinite(remaining)) return <span className="text-small text-ink2"> {t("Action deadline unavailable")} </span>;
  const overdue = remaining <= 0;
  const hours = Math.floor(Math.abs(remaining) / 3_600_000);
  const minutes = Math.floor((Math.abs(remaining) % 3_600_000) / 60_000);

  const urgent = !overdue && remaining < 3_600_000;
  const tone = overdue ? 'text-danger' : urgent ? 'text-accent' : 'text-ink2';

  return (
    <span className={`flex items-baseline gap-1.5 text-bodyLg ${tone}`}>
      {urgent && <span className={`${statusPill('accent')} me-1 self-center`}> {t("Urgent")} </span>}
      {/* No opacity on the label, and no tracking: it is Arabic. */}
      <span className="text-small">
        {shipping
          ? (overdue ? t("Dispatch overdue") : t("Dispatch due in"))
          : (overdue ? t("Overdue by") : t("Due in"))}
      </span>
      {hours > 0 && <span className="tnum font-semibold">{num(hours)}<span className="text-small font-normal">  {t("h")} </span></span>}
      <span className="tnum font-semibold">{num(minutes)}<span className="text-small font-normal">  {t("min")} </span></span>
    </span>
  );
}
