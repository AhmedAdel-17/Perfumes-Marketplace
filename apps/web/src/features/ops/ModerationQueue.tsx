'use client';

/**
 * The moderation queue.
 *
 * A moderator has one question per listing — does this go on the shopfront —
 * and the screen exists to answer it without leaving. So everything needed to
 * decide is on the row: what it is, what it costs, how long it has waited, and
 * what the claims inspector found in its text.
 *
 * THE FINDINGS ARE NOT A VERDICT. They are the sentences a rule noticed, quoted
 * so the person can read them. A screen that said "flagged" and hid the words
 * would make the moderator open another tab to do the actual work, and the
 * second tab is where consistency goes.
 */
import { useState, useTransition } from 'react';
import type { ClaimFinding, ModerationReason } from '@diyar/domain';
import { MODERATION_REASONS } from '@diyar/domain';
import { formatPrice, CURRENCY_LABEL, data as num, plural } from '@diyar/i18n';
import { PrimaryButton } from '@/features/shell/PrimaryButton';
import { decideListing } from './moderation-actions';

const REASON_LABELS: Record<ModerationReason, string> = {
  prohibited_claim: 'ادّعاء ممنوع',
  missing_required_fields: 'بيانات ناقصة',
  unsupported_claim: 'ادّعاء بلا دليل',
  misleading_media: 'صور مضلّلة',
  implausible_pricing: 'سعر غير منطقي',
  duplicate_listing: 'منتج مكرّر',
  restricted_ingredient: 'مكوّن مقيّد',
};

const CLAIM_LABELS: Record<ClaimFinding['code'], string> = {
  similarity_percentage: 'نسبة تطابق',
  replica_claim: 'ادّعاء نسخة',
  authorisation_claim: 'ادّعاء وكالة',
  designer_reference: 'ذكر دار أخرى',
};

/** ساعة / ساعتان / ساعات — the six Arabic plural categories, as everywhere. */
const HOUR = { zero: 'ساعة', one: 'ساعة', two: 'ساعتان', few: 'ساعات', many: 'ساعة', other: 'ساعة' };

export interface QueueRow {
  id: string;
  name: string;
  brandName: string;
  pricePiastres: number;
  volumeMl: number;
  waitingHours: number | null;
  claims: ClaimFinding[];
}

export function ModerationQueue({ rows }: { rows: QueueRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="px-5 py-10 text-bodyLg text-dim lg:px-0">
        لا توجد منتجات بانتظار المراجعة.
      </p>
    );
  }

  return (
    <ul className="px-5 lg:px-0">
      {rows.map((row) => <Entry key={row.id} row={row} />)}
    </ul>
  );
}

function Entry({ row }: { row: QueueRow }) {
  const [decided, setDecided] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<'draft' | 'suspended' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const decide = (to: 'published' | 'draft' | 'suspended', reason: ModerationReason | null) =>
    startTransition(async () => {
      const result = await decideListing(row.id, to, reason);
      if (result.ok) setDecided(to);
      else setMessage(result.message ?? 'تعذّر التنفيذ.');
    });

  if (decided) {
    return (
      <li className="border-b border-hair py-5 text-small text-faint">
        {row.name} — {decided === 'published' ? 'نُشر' : 'أُعيد إلى الدار'}
      </li>
    );
  }

  /*
   * Amber past a day, danger past three.
   *
   * A house waiting on moderation cannot sell, so the clock here is somebody's
   * revenue rather than a service metric. The thresholds are tighter than the
   * delivery queue's for that reason.
   */
  const late = row.waitingHours !== null && row.waitingHours >= 72;
  const slow = row.waitingHours !== null && row.waitingHours >= 24;

  return (
    <li className="border-b border-hair py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="font-display text-h4 text-bone">{row.name}</h2>
          <p className="mt-1 text-caption text-faint">
            {row.brandName} · <span className="tnum">{num(row.volumeMl)}</span> مل
          </p>
        </div>
        <div className="text-end">
          <div className="text-bodyLg text-bone">
            <span className="tnum">{formatPrice(row.pricePiastres)}</span>
            <span className="latin ms-1.5 text-micro tracking-label text-dim">{CURRENCY_LABEL}</span>
          </div>
          {row.waitingHours !== null && (
            <div className={`mt-1 text-caption ${late ? 'text-danger' : slow ? 'text-brass' : 'text-faint'}`}>
              انتظر <span className="tnum">{num(row.waitingHours)}</span>{' '}
              {plural(row.waitingHours, HOUR)}
            </div>
          )}
        </div>
      </div>

      {row.claims.length > 0 && (
        <ul className="mt-4 border-s-2 border-brass/60 ps-4">
          {row.claims.map((claim, i) => (
            <li key={i} className="py-1 text-small leading-relaxed text-dim">
              {CLAIM_LABELS[claim.code]} — <span className="text-faint">«{claim.evidence}»</span>
            </li>
          ))}
        </ul>
      )}

      {message && <p role="alert" className="mt-4 text-small text-danger">{message}</p>}

      {choosing ? (
        <div className="mt-5 border-t border-hair pt-4">
          <p className="mb-3 text-caption text-dim">اختر سببًا محدّدًا:</p>
          <div className="flex flex-wrap gap-2">
            {MODERATION_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                disabled={pending}
                onClick={() => decide(choosing, reason)}
                className="tappable flex min-h-touch items-center rounded-sm border border-hair px-4 text-small text-bone transition-colors duration-base ease-out hover:border-danger hover:text-danger disabled:opacity-disabled"
              >
                {REASON_LABELS[reason]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setChoosing(null)}
            className="tappable mt-4 flex min-h-touch items-center text-caption text-faint underline transition-colors duration-base ease-out hover:text-bone"
          >
            رجوع
          </button>
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap gap-3">
          <PrimaryButton
            type="button" fill="auto" disabled={pending}
            onClick={() => decide('published', null)}
          >
            {pending ? '…' : 'نشر'}
          </PrimaryButton>
          <button
            type="button"
            disabled={pending}
            onClick={() => setChoosing('draft')}
            className="tappable flex min-h-touch items-center rounded-sm border border-hair px-5 text-bodyLg text-dim transition-colors duration-base ease-out hover:border-danger hover:text-danger disabled:opacity-disabled"
          >
            إعادة للدار
          </button>
        </div>
      )}
    </li>
  );
}
