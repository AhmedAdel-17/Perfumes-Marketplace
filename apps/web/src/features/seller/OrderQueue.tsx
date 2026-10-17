'use client';

import { useEffect, useState } from 'react';
import {
  CURRENCY_LABEL, formatPrice, GOVERNORATE_AR, REASON_CODE_AR, stateCopy, internal as num,
} from '@diyar/i18n';
import { confirmSubOrder, declineSubOrder, dispatchSubOrder, fetchQueue } from './actions';
import { PrimaryButton } from '@/features/shell/PrimaryButton';
import { statusPill } from '@/features/shell/status-pill';
import { REJECTION_REASONS } from '@diyar/domain';

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
    return <p className="px-5 py-8 text-body text-ink3 lg:px-0">…جارٍ التحميل</p>;
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
        <p role="alert" className="mb-6 border border-danger bg-raised p-4 text-body text-ink">
          {error}
        </p>
      )}

      <Section title="بانتظار الرد" entries={toDecide} busyId={busyId} act={act} stage="decide" />
      <Section title="جاهزة للشحن" entries={toShip} busyId={busyId} act={act} stage="ship" />
      {rest.length > 0 && (
        <Section title="بقية الطلبات" entries={rest} busyId={busyId} act={act} stage="done" />
      )}

      {queue.length === 0 && (
        <p className="border border-line bg-raised px-6 py-9 text-center text-body leading-relaxed text-ink2">
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
      {/* The group's head in the register: its name and how many are in it,
          over a full-strength rule. */}
      <h2 className="mb-4 flex items-baseline gap-3 border-b border-ink pb-2 font-display text-h3 lg:text-h2">
        {title}
        <span className="latin tnum text-body text-ink3">{num(entries.length)}</span>
      </h2>
      {/*
        Two columns of cards from `lg`, not one card stretched to 1240px.

        A queue is read top to bottom and acted on one item at a time, so the
        card has an ideal MEASURE — wide enough for an address, narrow enough
        that the countdown and the confirm button stay in one glance. Widening
        the console without this simply moved the button 600px from the order
        number it belongs to. Two columns keep the measure and halve the
        scrolling, which is the actual thing an operator gains from a monitor.
      */}
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-5">
        {entries.map((entry) => (
          <Row key={entry.id} entry={entry} busy={busyId === entry.id} act={act} stage={stage} />
        ))}
      </div>
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
    <article className="mb-4 border border-ink bg-raised">
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
                <span className="tnum">{num(item.volumeMl)}</span> مل
              </span>
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
          {r.floor && <> · الدور <span className="tnum">{r.floor}</span></>}
          {r.apartment && <> · شقة <span className="tnum">{r.apartment}</span></>}
          <br />
          {r.area} · {r.city} · {GOVERNORATE_AR[r.governorate as keyof typeof GOVERNORATE_AR] ?? r.governorate}
          {r.landmark && (
            <>
              <br />
              <span className="text-ink3">علامة مميزة: {r.landmark}</span>
            </>
          )}
        </address>
      </div>

      <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
        {/* The state is Arabic: no tracking (CLAUDE.md §15). */}
        <span className={statusPill('quiet')}>{copy.label}</span>
        <span className="text-bodyLg">
          <span className="tnum">{formatPrice(entry.merchandisePiastres + entry.shippingPiastres)}</span>
          <span className="latin ms-1.5 text-micro tracking-label text-ink2">{CURRENCY_LABEL}</span>
        </span>
      </div>

      {entry.trackingNumber && (
        <div className="mt-3 flex justify-between border-t border-line pt-3 text-body">
          <span className="text-ink3">رقم الشحنة</span>
          <span className="latin tnum select-all text-ink">{entry.trackingNumber}</span>
        </div>
      )}

      {stage === 'ship' && (
        <div className="mt-4 border-t border-line pt-4">
          <label className="mb-2 block text-body text-ink2" htmlFor={`t-${entry.id}`}>
            رقم الشحنة من شركة الشحن
          </label>
          <div className="flex gap-3">
            <input
              id={`t-${entry.id}`}
              value={tracking}
              onChange={(event) => setTracking(event.target.value)}
              inputMode="text"
              autoComplete="off"
              className="latin h-control min-w-0 flex-1 border border-line bg-sunken px-4 text-bodyLg text-ink transition-colors duration-base ease-out focus:border-ink focus:outline-none"
            />
            <PrimaryButton type="button" disabled={busy || tracking.trim().length < 4} onClick={() => act(entry.id, () => dispatchSubOrder(entry.id, tracking))} fill="auto">
      {busy ? '…' : 'تم الشحن'}
    </PrimaryButton>
          </div>
          <p className="mt-2 text-small leading-relaxed text-ink3">
            اكتب الرقم كما هو على البوليصة. سيراه العميل في صفحة التتبّع.
          </p>
        </div>
      )}

      {stage === 'decide' && !declining && (
        <div className="mt-4 flex gap-3">
          <PrimaryButton type="button" disabled={busy} onClick={() => act(entry.id, () => confirmSubOrder(entry.id))} fill="flex">
      {busy ? '…' : 'تأكيد'}
    </PrimaryButton>
          <button
            type="button"
            disabled={busy}
            onClick={() => setDeclining(true)}
            className="flex h-control min-w-[120px] items-center justify-center border border-ink px-6 text-bodyLg text-ink transition-colors duration-base ease-out hover:border-danger hover:text-danger"
          >
            اعتذار
          </button>
        </div>
      )}

      {stage === 'decide' && declining && <DeclineReasons entry={entry} busy={busy} act={act} onCancel={() => setDeclining(false)} />}
      </div>
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
  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="mb-3 text-body text-ink2">اختر سببًا محدّدًا:</p>
      <div className="flex flex-wrap gap-2">
        {REASONS.map((reason) => (
          <button
            key={reason.value}
            type="button"
            disabled={busy}
            onClick={() => act(entry.id, () => declineSubOrder(entry.id, reason.value))}
            className="tappable flex min-h-touch items-center border border-line bg-ground px-4 text-body text-ink transition-colors duration-base ease-out hover:border-danger hover:text-danger disabled:opacity-disabled"
          >
            {reason.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="tappable mt-4 flex min-h-touch items-center text-body text-ink2 transition-colors duration-base ease-out hover:text-ink"
      >
        <span className="link-line">رجوع</span>
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
  const overdue = remaining <= 0;
  const hours = Math.floor(Math.abs(remaining) / 3_600_000);
  const minutes = Math.floor((Math.abs(remaining) % 3_600_000) / 60_000);

  const urgent = !overdue && remaining < 3_600_000;
  const tone = overdue ? 'text-danger' : urgent ? 'text-accent' : 'text-ink2';

  return (
    <span className={`flex items-baseline gap-1.5 text-bodyLg ${tone}`}>
      {urgent && <span className={`${statusPill('accent')} me-1 self-center`}>عاجل</span>}
      {/* No opacity on the label, and no tracking: it is Arabic. */}
      <span className="text-small">
        {shipping
          ? (overdue ? 'تأخّر الشحن' : 'متبقٍ للشحن')
          : (overdue ? 'تأخّر' : 'متبقٍ')}
      </span>
      {hours > 0 && <span className="tnum font-semibold">{num(hours)}<span className="text-small font-normal"> س</span></span>}
      <span className="tnum font-semibold">{num(minutes)}<span className="text-small font-normal"> د</span></span>
    </span>
  );
}
