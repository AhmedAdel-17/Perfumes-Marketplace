'use client';

import { useState, useTransition } from 'react';
import type { CostBearer, ReturnState } from '@diyar/domain';
import { ReturnLifecycle } from '@diyar/domain';
import {
  COST_BEARER_AR, CURRENCY_LABEL, RETURN_REASON_AR, RETURN_STATE_AR,
  formatPrice, westernDigits,
} from '@diyar/i18n';
import { PrimaryButton } from '@/features/shell/PrimaryButton';
import { resolveReturn } from './return-actions';

export interface ReturnRow {
  id: string;
  subOrderReference: string;
  brandName: string;
  productName: string | null;
  state: string;
  reason: string;
  customerNote: string | null;
  costBearer: string;
  refundPiastres: number | null;
  requestedAt: string;
}

const COST_BEARERS: readonly CostBearer[] = ['seller', 'platform', 'customer', 'courier'];

/**
 * Returns, from the platform's side — the screen where money moves.
 *
 * TWO THINGS ARE DELIBERATE HERE.
 *
 * The refund field appears only on a return that has been RECEIVED. The domain
 * refuses to reach `refunded` from anywhere else, so a field offered earlier
 * would be a field whose submit always fails — and worse, a screen implying
 * that refunding on a promise is something this marketplace does.
 *
 * The cost bearer is EDITABLE, and starts at what the reason implied. An
 * operator who looks at the evidence and disagrees should be able to move it;
 * what they should not be able to do is leave it unset and let the platform
 * absorb it silently, which is why nothing here offers `unallocated`.
 */
export function ReturnsBoard({ rows }: { rows: ReturnRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="px-5 py-10 text-bodyLg text-ink2 lg:px-0">
        لا توجد طلبات إرجاع.
      </p>
    );
  }

  return (
    <ul className="px-5 lg:px-0">
      {rows.map((row) => <Entry key={row.id} row={row} />)}
    </ul>
  );
}

function Entry({ row }: { row: ReturnRow }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [refund, setRefund] = useState('');
  const [bearer, setBearer] = useState<CostBearer>(row.costBearer as CostBearer);

  const state = row.state as ReturnState;
  const moves = (['approved', 'declined', 'in_transit', 'received', 'refunded', 'closed'] as const)
    .filter((to) => ReturnLifecycle.can(state, to, 'platform'));

  const act = (to: ReturnState, withRefund = false) => {
    setError(null);

    if (withRefund) {
      // Arabic-Indic digits from an Egyptian keyboard, folded before parsing.
      // Every validator downstream reads Western digits only, and an operator
      // typing ٤٥٠ into a money field is the normal case, not the exception.
      const major = Number(westernDigits(refund).replace(/[^\d.]/g, ''));
      if (!Number.isFinite(major) || major <= 0) {
        setError('أدخل المبلغ المردود بالجنيه.');
        return;
      }
      // Money is integer piastres everywhere. Rounding here rather than
      // carrying a float one line further.
      const piastres = Math.round(major * 100);
      start(async () => {
        const result = await resolveReturn({ id: row.id, to, refundPiastres: piastres, costBearer: bearer });
        if (!result.ok) setError(result.message);
      });
      return;
    }

    start(async () => {
      const result = await resolveReturn({ id: row.id, to, costBearer: bearer });
      if (!result.ok) setError(result.message);
    });
  };

  return (
    <li className="border-t border-line py-6 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <span className="text-small text-ink">{row.productName ?? 'الطلب كاملًا'}</span>
          <span className="text-caption text-ink3"> · {row.brandName}</span>
          <span className="latin ms-2 text-caption tracking-label text-ink3">
            {row.subOrderReference}
          </span>
        </div>
        <span className="text-caption text-accent">
          {RETURN_STATE_AR[state] ?? row.state}
        </span>
      </div>

      <p className="mt-2 text-small text-ink2">
        {RETURN_REASON_AR[row.reason as keyof typeof RETURN_REASON_AR] ?? row.reason}
      </p>

      {row.customerNote && (
        <p className="mt-2 max-w-proseMax border-s-2 border-line ps-3 text-small leading-relaxed text-ink2">
          {row.customerNote}
        </p>
      )}

      {row.refundPiastres !== null && (
        <p className="mt-2 text-caption text-ink2">
          رُدّ <span className="tnum">{formatPrice(row.refundPiastres)}</span>
          <span className="latin ms-1.5 text-micro tracking-label">{CURRENCY_LABEL}</span>
        </p>
      )}

      {error && <p role="alert" className="mt-3 text-caption text-danger">{error}</p>}

      {moves.length > 0 && (
        <div className="mt-4">
          <label className="inline-flex items-baseline gap-2">
            <span className="text-caption tracking-label text-ink3">التكلفة على</span>
            <select
              value={bearer}
              onChange={(event) => setBearer(event.target.value as CostBearer)}
              className="min-h-touch border border-line bg-raised px-2 text-small text-ink outline-none focus-visible:border-accent"
            >
              {COST_BEARERS.map((option) => (
                <option key={option} value={option}>{COST_BEARER_AR[option]}</option>
              ))}
            </select>
          </label>

          {/*
            The refund field, only where a refund is legal. The domain permits
            `refunded` from `received` and nowhere else — somebody physically
            had the bottle before money moved.
          */}
          {ReturnLifecycle.canRefund(state) && (
            <label className="ms-4 inline-flex items-baseline gap-2">
              <span className="text-caption tracking-label text-ink3">المبلغ</span>
              <input
                type="text"
                inputMode="decimal"
                value={refund}
                onChange={(event) => setRefund(event.target.value)}
                className="tnum min-h-touch w-28 border border-line bg-raised px-2 text-small text-ink outline-none focus-visible:border-accent"
              />
              <span className="latin text-micro tracking-label text-ink3">{CURRENCY_LABEL}</span>
            </label>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            {moves.map((to) => (
              to === 'refunded' ? (
                <PrimaryButton
                  key={to}
                  type="button"
                  fill="auto"
                  disabled={pending}
                  onClick={() => act(to, true)}
                >
                  {pending ? '…' : 'ردّ المبلغ'}
                </PrimaryButton>
              ) : (
                <button
                  key={to}
                  type="button"
                  disabled={pending}
                  onClick={() => act(to)}
                  // Both axes. `انتهى` is five narrow glyphs — 38px wide with the
                  // height fixed — so the width needs its own floor.
                  className="tappable min-h-touch min-w-touch border-b border-line pb-1 text-small text-ink2 transition-colors duration-base ease-out hover:border-accent hover:text-accent"
                >
                  {RETURN_STATE_AR[to]}
                </button>
              )
            ))}
          </div>
        </div>
      )}
    </li>
  );
}
