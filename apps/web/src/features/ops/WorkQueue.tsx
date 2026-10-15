'use client';

import { useEffect, useState } from 'react';
import { CURRENCY_LABEL, DAY, formatPrice, plural, internal as num } from '@diyar/i18n';
import { opsMarkDelivered, opsRecordRemittance } from './actions';
import { fetchWorkQueue } from './queue';
import { PrimaryButton } from '@/features/shell/PrimaryButton';

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
    return <p className="px-5 py-8 text-small text-ink3 lg:px-0">…جارٍ التحميل</p>;
  }

  const awaitingDelivery = queue.filter((e) => e.needs === 'delivery');
  const awaitingCash = queue.filter((e) => e.needs === 'remittance' && !e.remitted);

  return (
    <div className="px-5 lg:px-0">
      {error && (
        <p role="alert" className="mb-6 border border-danger bg-raised p-4 text-small text-ink">
          {error}
        </p>
      )}

      {awaitingDelivery.length === 0 && awaitingCash.length === 0 && (
        <p className="py-9 text-center text-small leading-relaxed text-ink3">
          لا شيء ينتظر إجراءً. كل الشحنات محدّثة.
        </p>
      )}

      <Group title="بانتظار تأكيد التسليم" entries={awaitingDelivery}>
        {(entry) => (
          <PrimaryButton type="button" disabled={busyId === entry.id} onClick={() => act(entry.id, () => opsMarkDelivered(entry.id))} fill="full">
      {busyId === entry.id ? '…' : 'تأكيد التسليم'}
    </PrimaryButton>
        )}
      </Group>

      <Group title="بانتظار تحصيل النقد" entries={awaitingCash}>
        {(entry) => <RemitForm entry={entry} busy={busyId === entry.id} act={act} />}
      </Group>
    </div>
  );
}

/**
 * Days since the parcel left, coloured by how overdue it feels.
 *
 * Amber past three days, danger past seven — a courier that has held a parcel
 * for a week has usually lost it, and the cash behind it is money the house is
 * waiting on. Neutral before that, because most parcels arrive normally and a
 * screen that shouts about all of them shouts about none.
 */
function Waiting({ since }: { since: string | null }) {
  if (!since) return <span className="text-small text-ink3">—</span>;

  const days = Math.floor((Date.now() - new Date(since).getTime()) / 86_400_000);
  const tone = days >= 7 ? 'text-danger' : days >= 3 ? 'text-accent' : 'text-ink3';

  return (
    <span className={`text-small ${tone}`}>
      {days === 0 ? 'اليوم' : <>منذ <span className="tnum">{num(days)}</span> {plural(days, DAY)}</>}
    </span>
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
      {/* The register's group head, as in the seller queue: the name and how
          many, over a full-strength rule. */}
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
        <article key={entry.id} className="mb-4 border border-line bg-raised p-4 lg:p-5">
          <div className="flex items-baseline justify-between gap-3">
            {/* How long it has been waiting, first.
                
                A list becomes a QUEUE when it says which item is oldest. An
                operator confirming deliveries needs to know whether a parcel
                has been in transit two days or nine — the second one needs
                chasing and the first does not, and without this the screen
                gives no way to tell them apart. */}
            <Waiting since={entry.dispatchedAt ?? entry.deliveredAt} />
            <span className="latin text-micro tracking-label text-ink3">{entry.reference}</span>
          </div>
          <div className="mt-1 text-small text-ink3">{entry.brandName}</div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-small text-ink2">{entry.recipientName}</span>
            <span className="text-bodyLg">
              <span className="tnum">{formatPrice(entry.totalPiastres)}</span>
              <span className="latin ms-1.5 text-micro tracking-label text-ink2">{CURRENCY_LABEL}</span>
            </span>
          </div>
          {entry.trackingNumber && (
            <div className="mt-2 text-small text-ink3">
              شحنة <span className="latin tnum select-all">{entry.trackingNumber}</span>
            </div>
          )}
          <div className="mt-4">{children(entry)}</div>
        </article>
      ))}
      </div>
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
      <label className="mb-2 block text-small text-ink2" htmlFor={`r-${entry.id}`}>
        المبلغ المحصّل بالجنيه
      </label>
      <div className="flex gap-3">
        <input
          id={`r-${entry.id}`}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="decimal"
          autoComplete="off"
          className="tnum h-control min-w-0 flex-1 border border-line bg-sunken px-4 text-bodyLg text-ink transition-colors duration-base ease-out focus:border-ink focus:outline-none"
        />
        <PrimaryButton type="button" disabled={busy || !valid} onClick={() => act(entry.id, () => opsRecordRemittance(entry.id, piastres))} fill="auto">
      {busy ? '…' : 'تسجيل'}
    </PrimaryButton>
      </div>
      <p className="mt-2 text-small leading-relaxed text-ink3">
        المتوقّع <span className="tnum">{formatPrice(entry.totalPiastres)}</span>{' '}
        {CURRENCY_LABEL}. اكتب ما وصل فعلًا.
      </p>
    </div>
  );
}
