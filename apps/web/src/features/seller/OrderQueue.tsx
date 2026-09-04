'use client';

import { useEffect, useState } from 'react';
import { CURRENCY_LABEL, formatPrice, GOVERNORATE_AR, stateCopy, internal as num } from '@diyar/i18n';
import { confirmSubOrder, declineSubOrder, dispatchSubOrder, fetchQueue } from './actions';

type Queue = NonNullable<Awaited<ReturnType<typeof fetchQueue>>>;
type Entry = Queue[number];

/**
 * The order queue.
 *
 * This is the most time-critical surface in the product: every row is a
 * countdown against a confirmation SLA, and a house that misses it costs a
 * customer and a chargeback of goodwill. So the design does one thing above
 * all — it makes the deadline the loudest element on the row, above the money.
 *
 * The list arrives sorted by deadline, not by arrival. Sorted by arrival, the
 * order about to breach hides behind five that are not.
 */
export function OrderQueue() {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => setQueue(await fetchQueue());
  useEffect(() => { void load(); }, []);

  const act = async (id: string, run: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusyId(id);
    setError(null);
    const result = await run();
    if (!result.ok) setError(result.message ?? 'تعذّر تنفيذ الإجراء.');
    await load();
    setBusyId(null);
  };

  if (queue === null) {
    return <p className="px-5 py-8 text-small text-faint lg:px-0">…جارٍ التحميل</p>;
  }

  // Three groups, in the order a house works through them: decide, then pack
  // and ship, then everything that has left. A single list sorted by date makes
  // the house re-read every row to find the two it can act on.
  const toDecide = queue.filter((e) => e.state === 'placed' || e.state === 'awaiting_seller');
  const toShip = queue.filter((e) => e.state === 'confirmed');
  const rest = queue.filter((e) => !toDecide.includes(e) && !toShip.includes(e));

  return (
    <div className="px-5 lg:px-0">
      {error && (
        <p role="alert" className="mb-6 border border-[#B5697E]/50 bg-l1 p-4 text-small text-bone">
          {error}
        </p>
      )}

      <Section title="بانتظار الرد" entries={toDecide} busyId={busyId} act={act} stage="decide" />
      <Section title="جاهزة للشحن" entries={toShip} busyId={busyId} act={act} stage="ship" />
      {rest.length > 0 && (
        <Section title="بقية الطلبات" entries={rest} busyId={busyId} act={act} stage="done" />
      )}

      {queue.length === 0 && (
        <p className="py-9 text-center text-small leading-relaxed text-faint">
          لا توجد طلبات بعد.
        </p>
      )}
    </div>
  );
}

type Stage = 'decide' | 'ship' | 'done';

function Section({
  title, entries, busyId, act, stage,
}: {
  title: string;
  entries: readonly Entry[];
  busyId: string | null;
  act(id: string, run: () => Promise<{ ok: boolean; message?: string }>): Promise<void>;
  stage: Stage;
}) {
  if (entries.length === 0) return null;
  return (
    <section className="mb-9">
      <h2 className="mb-4 border-b border-hair pb-3 font-display text-h3 lg:text-h2Lg">
        {title} <span className="text-faint">·</span>{' '}
        <span className="tnum text-faint">{num(entries.length)}</span>
      </h2>
      {entries.map((entry) => (
        <Row key={entry.id} entry={entry} busy={busyId === entry.id} act={act} stage={stage} />
      ))}
    </section>
  );
}

function Row({
  entry, busy, act, stage,
}: {
  entry: Entry;
  busy: boolean;
  act(id: string, run: () => Promise<{ ok: boolean; message?: string }>): Promise<void>;
  stage: Stage;
}) {
  const [declining, setDeclining] = useState(false);
  const [tracking, setTracking] = useState('');
  const copy = stateCopy(entry.state);
  const r = entry.recipient;

  return (
    <article className="mb-4 border border-hair bg-l1 p-4 lg:p-5">
      {/*
        The card is read in the order the work happens: how long is left, what
        to put in the box, where it goes. The reference is the least urgent
        thing on it and used to be the most prominent.
      */}
      <header className="flex items-baseline justify-between gap-3 border-b border-hair pb-3">
        <Countdown dueAt={entry.confirmDueAt} state={entry.state} />
        <span className="latin text-micro tracking-label text-faint">{entry.reference}</span>
      </header>

      {/* What goes in the box — the largest thing on the card, because it is
          what the person holding it is looking for. */}
      <ul className="mt-4">
        {entry.items.map((item) => (
          <li key={item.sku} className="flex items-baseline justify-between gap-3 py-1.5">
            <span className="font-display text-h4">
              {item.name}
              <span className="ms-2 text-caption text-faint">
                <span className="tnum">{num(item.volumeMl)}</span> مل
              </span>
            </span>
            <span className="flex items-baseline gap-2">
              {item.quantity > 1 && (
                <span className="rounded-sm bg-brass/15 px-2 py-0.5 text-caption text-brass">
                  <span className="tnum">×{num(item.quantity)}</span>
                </span>
              )}
              <span className="latin text-micro tracking-label text-faint">{item.sku}</span>
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
      <div className="mt-4 border-t border-hair pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="text-bodyLg text-bone">{r.name}</span>
          <a
            href={`tel:${r.phone}`}
            className="tappable latin tnum flex min-h-touch items-center text-bodyLg text-brass transition-opacity duration-base ease-out hover:opacity-press"
          >
            {r.phone}
          </a>
        </div>

        <address className="mt-2 text-caption not-italic leading-relaxed text-dim">
          {r.building} {r.street}
          {r.floor && <> · الدور <span className="tnum">{r.floor}</span></>}
          {r.apartment && <> · شقة <span className="tnum">{r.apartment}</span></>}
          <br />
          {r.area} · {r.city} · {GOVERNORATE_AR[r.governorate as keyof typeof GOVERNORATE_AR] ?? r.governorate}
          {r.landmark && (
            <>
              <br />
              <span className="text-faint">علامة مميزة: {r.landmark}</span>
            </>
          )}
        </address>
      </div>

      <div className="mt-4 flex items-baseline justify-between border-t border-hair pt-3">
        <span className="text-caption tracking-label text-faint">{copy.label}</span>
        <span className="text-bodyLg font-semibold">
          <span className="tnum">{formatPrice(entry.merchandisePiastres + entry.shippingPiastres)}</span>
          <span className="latin ms-1.5 text-micro tracking-label text-dim">{CURRENCY_LABEL}</span>
        </span>
      </div>

      {entry.trackingNumber && (
        <div className="mt-3 flex justify-between border-t border-hair pt-3 text-caption">
          <span className="text-faint">رقم الشحنة</span>
          <span className="latin tnum select-all text-bone">{entry.trackingNumber}</span>
        </div>
      )}

      {stage === 'ship' && (
        <div className="mt-4 border-t border-hair pt-4">
          <label className="mb-2 block text-caption tracking-label text-dim" htmlFor={`t-${entry.id}`}>
            رقم الشحنة من شركة الشحن
          </label>
          <div className="flex gap-3">
            <input
              id={`t-${entry.id}`}
              value={tracking}
              onChange={(event) => setTracking(event.target.value)}
              inputMode="text"
              autoComplete="off"
              className="latin h-control min-w-0 flex-1 rounded-sm border border-hair bg-noir px-4 text-bodyLg text-bone transition-colors duration-base ease-out focus:border-dim focus:outline-none focus-visible:border-brass"
            />
            <button
              type="button"
              disabled={busy || tracking.trim().length < 4}
              onClick={() => act(entry.id, () => dispatchSubOrder(entry.id, tracking))}
              className="relative flex h-control items-center justify-center overflow-hidden rounded-sm bg-[linear-gradient(180deg,#C4A06A_0%,#B08D57_52%,#9A7A48_100%)] px-6 text-bodyLg font-medium tracking-[1.2px] text-noir transition-[filter,opacity] duration-base ease-out hover:brightness-110 disabled:opacity-disabled"
            >
              <span className="absolute inset-x-0 top-0 h-px bg-white/30" aria-hidden />
              {busy ? '…' : 'تم الشحن'}
            </button>
          </div>
          <p className="mt-2 text-micro leading-relaxed text-faint">
            اكتب الرقم كما هو على البوليصة. سيراه العميل في صفحة التتبّع.
          </p>
        </div>
      )}

      {stage === 'decide' && !declining && (
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => act(entry.id, () => confirmSubOrder(entry.id))}
            className="relative flex h-control flex-1 items-center justify-center overflow-hidden rounded-sm bg-[linear-gradient(180deg,#C4A06A_0%,#B08D57_52%,#9A7A48_100%)] text-bodyLg font-medium tracking-[1.2px] text-noir transition-[filter,opacity] duration-base ease-out hover:brightness-110 disabled:opacity-disabled"
          >
            <span className="absolute inset-x-0 top-0 h-px bg-white/30" aria-hidden />
            {busy ? '…' : 'تأكيد'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setDeclining(true)}
            className="flex h-control min-w-[120px] items-center justify-center rounded-sm border border-hair px-6 text-bodyLg text-dim transition-colors duration-base ease-out hover:border-[#B5697E] hover:text-[#B5697E]"
          >
            اعتذار
          </button>
        </div>
      )}

      {stage === 'decide' && declining && <DeclineReasons entry={entry} busy={busy} act={act} onCancel={() => setDeclining(false)} />}
    </article>
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
const REASONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'out_of_stock', label: 'نفد المخزون' },
  { value: 'pricing_error', label: 'خطأ في السعر' },
  { value: 'cannot_fulfil_sla', label: 'لا يمكن التجهيز في الوقت' },
  { value: 'suspected_fraud', label: 'اشتباه في الطلب' },
];

function DeclineReasons({
  entry, busy, act, onCancel,
}: {
  entry: Entry;
  busy: boolean;
  act(id: string, run: () => Promise<{ ok: boolean; message?: string }>): Promise<void>;
  onCancel(): void;
}) {
  return (
    <div className="mt-4 border-t border-hair pt-4">
      <p className="mb-3 text-caption text-dim">اختر سببًا محدّدًا:</p>
      <div className="flex flex-wrap gap-2">
        {REASONS.map((reason) => (
          <button
            key={reason.value}
            type="button"
            disabled={busy}
            onClick={() => act(entry.id, () => declineSubOrder(entry.id, reason.value))}
            className="tappable flex min-h-touch items-center rounded-sm border border-hair px-4 text-small text-bone transition-colors duration-base ease-out hover:border-[#B5697E] hover:text-[#B5697E] disabled:opacity-disabled"
          >
            {reason.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="tappable mt-4 flex min-h-touch items-center text-caption text-faint underline transition-colors duration-base ease-out hover:text-bone"
      >
        رجوع
      </button>
    </div>
  );
}

/**
 * The confirmation deadline, as time remaining rather than a timestamp.
 *
 * "18:40" requires the reader to know what time it is now and do subtraction;
 * "متبقٍ ٣ ساعات" does not. It turns amber under an hour and red once it has
 * passed, because a breached SLA has to look different from a tight one.
 */
function Countdown({ dueAt, state }: { dueAt: string | null; state: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (state !== 'placed' && state !== 'awaiting_seller') return;
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [state]);

  if (!dueAt || (state !== 'placed' && state !== 'awaiting_seller')) return null;

  const remaining = new Date(dueAt).getTime() - now;
  const overdue = remaining <= 0;
  const hours = Math.floor(Math.abs(remaining) / 3_600_000);
  const minutes = Math.floor((Math.abs(remaining) % 3_600_000) / 60_000);

  const tone = overdue
    ? 'text-[#D69AA8]'
    : remaining < 3_600_000
      ? 'text-brass'
      : 'text-faint';

  return (
    <span className={`flex items-baseline gap-1.5 text-bodyLg ${tone}`}>
      <span className="text-caption tracking-label opacity-80">
        {overdue ? 'تأخّر' : 'متبقٍ'}
      </span>
      {hours > 0 && <span className="tnum font-semibold">{num(hours)}<span className="text-caption font-normal"> س</span></span>}
      <span className="tnum font-semibold">{num(minutes)}<span className="text-caption font-normal"> د</span></span>
    </span>
  );
}
