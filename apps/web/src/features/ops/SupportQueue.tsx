'use client';

import { useState, useTransition } from 'react';
import {
  SUPPORT_CATEGORY_AR, TICKET_PRIORITY_AR, TICKET_STATUS_AR, internalDate,
} from '@diyar/i18n';
import { PrimaryButton } from '@/features/shell/PrimaryButton';
import { statusPill } from '@/features/shell/status-pill';
import { updateTicket } from './support-actions';

export interface TicketRow {
  id: string;
  reference: string;
  category: string;
  subject: string;
  message: string;
  contactName: string;
  contactPhone: string;
  priority: string;
  status: string;
  orderReference: string | null;
  nextAction: string | null;
  createdAt: string;
  firstResponseAt: string | null;
}

const STATUSES = ['open', 'waiting', 'resolved', 'closed'] as const;

/**
 * The support queue.
 *
 * Sorted by priority and then by age, which is the order the work should be done
 * in. Sorted by arrival — the obvious default — this morning's broken bottle
 * sits behind twelve questions about shipping from last week.
 *
 * THE WHOLE MESSAGE IS ON THE ROW. A truncated preview with a "view" link means
 * an operator triages from a subject line, and a subject line is written by
 * somebody who is upset and in a hurry.
 *
 * `firstResponseAt` is shown because it is the number that matters: not how many
 * tickets are open, but how long somebody waited to hear from a person.
 */
export function SupportQueue({ rows }: { rows: TicketRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="px-5 py-10 text-bodyLg text-ink2 lg:px-0">
        لا توجد رسائل مفتوحة.
      </p>
    );
  }

  return (
    <ul className="px-5 lg:px-0">
      {rows.map((row) => <Entry key={row.id} row={row} />)}
    </ul>
  );
}

function Entry({ row }: { row: TicketRow }) {
  const [pending, start] = useTransition();
  const [status, setStatus] = useState(row.status);
  const [nextAction, setNextAction] = useState(row.nextAction ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = () => {
    setError(null);
    setSaved(false);
    start(async () => {
      const result = await updateTicket({
        id: row.id,
        status: status as typeof STATUSES[number],
        nextAction: nextAction.trim() || null,
      });
      if (result.ok) setSaved(true);
      else setError(result.message);
    });
  };

  const urgent = row.priority === 'p0' || row.priority === 'p1';

  return (
    <li className="border-t border-line py-6 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <span className="text-small text-ink">{row.subject}</span>
          <span className="latin ms-2 text-caption tracking-label text-ink3">{row.reference}</span>
        </div>
        <span
          className={statusPill(urgent ? 'danger' : 'accent')}
        >
          {TICKET_PRIORITY_AR[row.priority as keyof typeof TICKET_PRIORITY_AR] ?? row.priority}
        </span>
      </div>

      <div className="mt-1 text-caption text-ink3">
        {SUPPORT_CATEGORY_AR[row.category as keyof typeof SUPPORT_CATEGORY_AR] ?? row.category}
        {' · '}
        {row.contactName}
        {' · '}
        <span className="latin tnum select-all">{row.contactPhone}</span>
        {row.orderReference && (
          <> · <span className="latin select-all">{row.orderReference}</span></>
        )}
      </div>

      {/* The whole message. An operator triaging from a subject line is an
          operator guessing. */}
      <p className="mt-3 max-w-proseMax whitespace-pre-line text-small leading-relaxed text-ink2">
        {row.message}
      </p>

      <p className="mt-2 text-micro text-ink3">
        وصلت{' '}
        <time dateTime={row.createdAt}>
          {internalDate(row.createdAt, { time: true })}
        </time>
        {row.firstResponseAt === null
          // The number that matters. Not how many are open — how long somebody
          // has been waiting to hear from a person.
          ? <span className="text-danger"> · لم يُردّ عليها بعد</span>
          : ' · رُدّ عليها'}
      </p>

      {error && <p role="alert" className="mt-3 text-caption text-danger">{error}</p>}
      {saved && <p className="mt-3 text-caption text-accent">حُفظ.</p>}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="inline-flex items-baseline gap-2">
          <span className="text-caption tracking-label text-ink3">الحالة</span>
          <select
            value={status}
            onChange={(event) => { setStatus(event.target.value); setSaved(false); }}
            className="min-h-touch border border-line bg-raised px-2 text-small text-ink outline-none focus-visible:border-accent"
          >
            {STATUSES.map((option) => (
              <option key={option} value={option}>{TICKET_STATUS_AR[option]}</option>
            ))}
          </select>
        </label>

        <label className="min-w-[240px] flex-1">
          {/*
            What the CUSTOMER sees next. Named as such, because this box is the
            only thing on the ticket the person who wrote it will ever read, and
            an operator using it for internal shorthand is writing to a stranger
            without realising.
          */}
          <span className="text-caption tracking-label text-ink3">ما يظهر للعميل</span>
          <input
            type="text"
            value={nextAction}
            onChange={(event) => { setNextAction(event.target.value); setSaved(false); }}
            maxLength={500}
            className="mt-1 block w-full border border-line bg-raised p-2.5 text-small text-ink outline-none transition-colors duration-base ease-out focus-visible:border-accent"
          />
        </label>

        <PrimaryButton type="button" fill="auto" disabled={pending} onClick={save}>
          {pending ? '…' : 'احفظ'}
        </PrimaryButton>
      </div>
    </li>
  );
}
