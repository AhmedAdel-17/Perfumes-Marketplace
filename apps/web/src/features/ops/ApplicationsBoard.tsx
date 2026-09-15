'use client';

import { useState, useTransition } from 'react';
import type { VerificationControl, VerificationStatus } from '@diyar/domain';
import {
  VERIFICATION_CONTROL_AR, VERIFICATION_STATUS_AR, internal as num, internalDate,
} from '@diyar/i18n';
import { PrimaryButton } from '@/features/shell/PrimaryButton';
import { statusPill } from '@/features/shell/status-pill';
import { fetchApplication, setHouseStatus, verifyControl } from './application-actions';

export interface ApplicationRow {
  id: string;
  tradingName: string;
  slug: string;
  ownerName: string;
  contactPhone: string;
  contactEmail: string | null;
  city: string | null;
  status: string;
  applicationNote: string | null;
  appliedAt: string | null;
  approvedControls: number;
  totalControls: number;
}

interface Control {
  control: string;
  status: string;
  notes: string | null;
  reviewedAt: string | null;
}

/**
 * The intake queue.
 *
 * A house does not go live because somebody pressed a button — it goes live
 * because eight controls have passed and the database then permits the
 * transition. So the row leads with "6 of 8" rather than with an approve
 * button, and the button is what happens after the eight, not instead of them.
 *
 * Oldest first. An applicant who has been waiting three weeks is the one most
 * likely to give up, and a queue sorted newest-first hides exactly them.
 */
export function ApplicationsBoard({ rows }: { rows: ApplicationRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="px-5 py-10 text-bodyLg text-ink2 lg:px-0">
        لا توجد طلبات انضمام.
      </p>
    );
  }

  return (
    <ul className="px-5 lg:px-0">
      {rows.map((row) => <Entry key={row.id} row={row} />)}
    </ul>
  );
}

function Entry({ row }: { row: ApplicationRow }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [controls, setControls] = useState<Control[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState(row.status);
  const [approved, setApproved] = useState(row.approvedControls);

  const load = async () => {
    const detail = await fetchApplication(row.id);
    if (detail) {
      setControls(detail.controls);
      setApproved(detail.approvedControls);
      setStatus(detail.status);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && controls === null) start(() => load());
  };

  const mark = (control: string, to: VerificationStatus) => {
    setError(null);
    start(async () => {
      const result = await verifyControl({
        sellerId: row.id,
        control: control as VerificationControl,
        status: to,
        notes: null,
      });
      if (!result.ok) setError(result.message);
      await load();
    });
  };

  const move = (to: 'under_review' | 'approved' | 'live' | 'terminated') => {
    setError(null);
    start(async () => {
      const result = await setHouseStatus(row.id, to);
      if (result.ok) setStatus(to);
      else {
        /*
         * The database refused it, and that is the interesting case.
         *
         * Going live requires all eight controls; the trigger in 0001 raises
         * when they have not passed. Showing the raw refusal rather than a
         * generic "something went wrong" is what tells the operator WHY, and
         * the message names the missing controls.
         */
        setError(result.message);
      }
      await load();
    });
  };

  const complete = approved === row.totalControls;

  return (
    <li className="border-t border-line py-6 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <span className="text-small text-ink">{row.tradingName}</span>
          <span className="latin ms-2 text-caption tracking-label text-ink3">{row.slug}</span>
        </div>
        <span
          // Outlined in both states — see `status-pill.ts` for why a tint fails.
          className={statusPill(complete ? 'accent' : 'quiet')}
        >
          <span className="tnum">{num(approved)}</span> من{' '}
          <span className="tnum">{num(row.totalControls)}</span>
        </span>
      </div>

      <div className="mt-1 text-caption text-ink3">
        {row.ownerName}
        {' · '}
        <span className="latin tnum select-all">{row.contactPhone}</span>
        {row.city && <> · {row.city}</>}
        {row.appliedAt && (
          <> · <time dateTime={row.appliedAt}>
            {internalDate(row.appliedAt)}
          </time></>
        )}
      </div>

      {row.applicationNote && (
        <p className="mt-3 max-w-proseMax whitespace-pre-line border-s-2 border-line ps-3 text-small leading-relaxed text-ink2">
          {row.applicationNote}
        </p>
      )}

      {error && <p role="alert" className="mt-3 text-caption leading-relaxed text-danger">{error}</p>}

      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="tappable mt-4 min-h-touch border-b border-accent/50 text-small transition-colors duration-base ease-out hover:border-accent hover:text-accent"
      >
        {open ? 'إخفاء بنود المراجعة' : 'بنود المراجعة'}
      </button>

      {open && (
        <div className="mt-4 border border-line bg-raised p-4">
          {controls === null ? (
            <p className="text-caption text-ink3">…جارٍ التحميل</p>
          ) : (
            <ul>
              {controls.map((control) => (
                <li
                  key={control.control}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line py-3 first:border-t-0"
                >
                  <span className="text-small text-ink2">
                    {VERIFICATION_CONTROL_AR[control.control as keyof typeof VERIFICATION_CONTROL_AR]
                      ?? control.control}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-caption text-ink3">
                      {VERIFICATION_STATUS_AR[control.status as keyof typeof VERIFICATION_STATUS_AR]
                        ?? control.status}
                    </span>
                    {control.status !== 'approved' ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => mark(control.control, 'approved')}
                        className="tappable min-h-touch text-caption text-accent transition-colors duration-base ease-out hover:text-ink"
                      >
                        اعتمد
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => mark(control.control, 'pending')}
                        className="tappable min-h-touch text-caption text-ink3 transition-colors duration-base ease-out hover:text-danger"
                      >
                        تراجع
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {status === 'applied' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => move('under_review')}
            className="tappable min-h-touch border-b border-line pb-1 text-small text-ink2 transition-colors duration-base ease-out hover:border-accent hover:text-accent"
          >
            ابدأ المراجعة
          </button>
        )}

        {status !== 'live' && (
          <PrimaryButton
            type="button"
            fill="auto"
            // Not disabled on the count — the DATABASE decides, and letting an
            // operator try teaches them the rule through a message that names
            // the missing controls, rather than through a grey button.
            disabled={pending}
            onClick={() => move('live')}
          >
            {pending ? '…' : 'اجعلها مباشرة'}
          </PrimaryButton>
        )}

        {status !== 'terminated' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => move('terminated')}
            // Both axes: `ارفض` is 41px wide with the height fixed.
            className="tappable min-h-touch min-w-touch border-b border-line pb-1 text-small text-ink3 transition-colors duration-base ease-out hover:border-danger hover:text-danger"
          >
            ارفض
          </button>
        )}
      </div>
    </li>
  );
}
