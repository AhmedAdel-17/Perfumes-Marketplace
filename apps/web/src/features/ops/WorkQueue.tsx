'use client';

import { useEffect, useState } from 'react';
import { CURRENCY_LABEL, formatPrice, internal as num } from '@diyar/i18n';
import { opsMarkDelivered, opsRecordRemittance } from './actions';
import { fetchWorkQueue } from './queue';

type Queue = NonNullable<Awaited<ReturnType<typeof fetchWorkQueue>>>;
type Entry = Queue[number];

/**
 * The operations console.
 *
 * It shows only what is WAITING on a human here, and the emptiness is the
 * feature: an empty screen means nothing is stalled. A console listing every
 * order would be reassuringly busy and completely useless, because the two
 * things that actually block a house getting paid — a parcel nobody has
 * confirmed arrived, and cash nobody has recorded arriving — would be buried
 * among hundreds that need nothing.
 *
 * Both actions are irreversible in practice: they release money down the line.
 * Recording remittance therefore asks for the AMOUNT rather than accepting the
 * expected figure with one tap, because a courier remitting the wrong amount is
 * an ordinary event and confirming a pre-filled number is not checking it.
 */
export function OpsWorkQueue() {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => setQueue(await fetchWorkQueue());
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

  const awaitingDelivery = queue.filter((e) => e.needs === 'delivery');
  const awaitingCash = queue.filter((e) => e.needs === 'remittance' && !e.remitted);

  return (
    <div className="px-5 lg:px-0">
      {error && (
        <p role="alert" className="mb-6 border border-[#B5697E]/50 bg-l1 p-4 text-small text-bone">
          {error}
        </p>
      )}

      {awaitingDelivery.length === 0 && awaitingCash.length === 0 && (
        <p className="py-9 text-center text-small leading-relaxed text-faint">
          لا شيء ينتظر إجراءً. كل الشحنات محدّثة.
        </p>
      )}

      <Group title="بانتظار تأكيد التسليم" entries={awaitingDelivery}>
        {(entry) => (
          <button
            type="button"
            disabled={busyId === entry.id}
            onClick={() => act(entry.id, () => opsMarkDelivered(entry.id))}
            className="relative flex h-control w-full items-center justify-center overflow-hidden rounded-sm bg-[linear-gradient(180deg,#C4A06A_0%,#B08D57_52%,#9A7A48_100%)] text-bodyLg font-medium tracking-[1.2px] text-noir transition-[filter,opacity] duration-base ease-out hover:brightness-110 disabled:opacity-disabled"
          >
            <span className="absolute inset-x-0 top-0 h-px bg-white/30" aria-hidden />
            {busyId === entry.id ? '…' : 'تأكيد التسليم'}
          </button>
        )}
      </Group>

      <Group title="بانتظار تحصيل النقد" entries={awaitingCash}>
        {(entry) => <RemitForm entry={entry} busy={busyId === entry.id} act={act} />}
      </Group>
    </div>
  );
}

function Group({
  title, entries, children,
}: {
  title: string;
  entries: readonly Entry[];
  children(entry: Entry): React.ReactNode;
}) {
  if (entries.length === 0) return null;
  return (
    <section className="mb-9">
      <h2 className="mb-4 border-b border-hair pb-3 font-display text-h3 lg:text-h2Lg">
        {title} <span className="tnum text-faint">{num(entries.length)}</span>
      </h2>
      {entries.map((entry) => (
        <article key={entry.id} className="mb-4 border border-hair bg-l1 p-4 lg:p-5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="latin text-caption tracking-label text-brass">{entry.reference}</span>
            <span className="text-caption text-faint">{entry.brandName}</span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-small text-dim">{entry.recipientName}</span>
            <span className="text-bodyLg font-semibold">
              <span className="tnum">{formatPrice(entry.totalPiastres)}</span>
              <span className="latin ms-1.5 text-micro tracking-label text-dim">{CURRENCY_LABEL}</span>
            </span>
          </div>
          {entry.trackingNumber && (
            <div className="mt-2 text-caption text-faint">
              شحنة <span className="latin tnum select-all">{entry.trackingNumber}</span>
            </div>
          )}
          <div className="mt-4">{children(entry)}</div>
        </article>
      ))}
    </section>
  );
}

/**
 * Remittance asks for the figure.
 *
 * The expected amount is shown as a hint, NOT pre-filled. A pre-filled total
 * confirmed with one tap is not a check — and short remittance is an ordinary
 * event, not an exception: the courier deducts a fee, the customer paid part in
 * cash, a note was refused. Typing the number is the control.
 */
function RemitForm({
  entry, busy, act,
}: {
  entry: Entry;
  busy: boolean;
  act(id: string, run: () => Promise<{ ok: boolean; message?: string }>): Promise<void>;
}) {
  const [amount, setAmount] = useState('');
  const piastres = Math.round(Number(amount.replace(/[^\d.]/g, '')) * 100);
  const valid = Number.isFinite(piastres) && piastres >= 0 && amount.trim() !== '';

  return (
    <div>
      <label className="mb-2 block text-caption tracking-label text-dim" htmlFor={`r-${entry.id}`}>
        المبلغ المحصّل بالجنيه
      </label>
      <div className="flex gap-3">
        <input
          id={`r-${entry.id}`}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="decimal"
          autoComplete="off"
          className="tnum h-control min-w-0 flex-1 rounded-sm border border-hair bg-noir px-4 text-bodyLg text-bone transition-colors duration-base ease-out focus:border-dim focus:outline-none focus-visible:border-brass"
        />
        <button
          type="button"
          disabled={busy || !valid}
          onClick={() => act(entry.id, () => opsRecordRemittance(entry.id, piastres))}
          className="relative flex h-control items-center justify-center overflow-hidden rounded-sm bg-[linear-gradient(180deg,#C4A06A_0%,#B08D57_52%,#9A7A48_100%)] px-6 text-bodyLg font-medium tracking-[1.2px] text-noir transition-[filter,opacity] duration-base ease-out hover:brightness-110 disabled:opacity-disabled"
        >
          <span className="absolute inset-x-0 top-0 h-px bg-white/30" aria-hidden />
          {busy ? '…' : 'تسجيل'}
        </button>
      </div>
      <p className="mt-2 text-micro leading-relaxed text-faint">
        المتوقّع <span className="tnum">{formatPrice(entry.totalPiastres)}</span>{' '}
        {CURRENCY_LABEL}. اكتب ما وصل فعلًا.
      </p>
    </div>
  );
}
