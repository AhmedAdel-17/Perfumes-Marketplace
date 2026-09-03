'use client';

import { useEffect, useState } from 'react';
import { CURRENCY_LABEL, formatPrice, data as num } from '@diyar/i18n';
import { fetchPayouts, fetchStatement } from './actions';

type Payouts = NonNullable<Awaited<ReturnType<typeof fetchPayouts>>>;
type Statement = NonNullable<Awaited<ReturnType<typeof fetchStatement>>>;

/**
 * What the house is owed, and why.
 *
 * Doc 03 §7: every payout carries an itemised statement and a dispute
 * deadline. That requirement is not administrative — the entire commission
 * model rests on a seller believing the number, and a total with nothing
 * behind it is a number they are asked to take on faith from the party that
 * subtracted the fee.
 *
 * So the statement leads with the ARITHMETIC, not the total: gross, then the
 * fee with its rate, then net. A house that can follow the subtraction does not
 * need to trust it.
 */
export function SellerPayouts() {
  const [payouts, setPayouts] = useState<Payouts | null>(null);
  const [open, setOpen] = useState<Statement | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => { void fetchPayouts().then(setPayouts); }, []);

  if (payouts === null) {
    return <p className="px-5 py-8 text-small text-faint lg:px-0">…جارٍ التحميل</p>;
  }

  if (open) return <StatementView statement={open} onBack={() => setOpen(null)} />;

  if (payouts.length === 0) {
    return (
      <div className="px-5 py-9 lg:px-0">
        <p className="font-display text-h3">لا توجد كشوف بعد</p>
        <p className="mt-3 max-w-proseMax text-small leading-relaxed text-faint">
          {/* Says WHY it is empty. "No statements" alone reads as a fault. */}
          يصدر الكشف بعد تسليم الطلبات وتحصيل قيمتها، ومرور مدة الاحتجاز.
        </p>
      </div>
    );
  }

  return (
    <div className="px-5 lg:px-0">
      {payouts.map((payout) => (
        <button
          key={payout.id}
          type="button"
          disabled={loadingId === payout.id}
          onClick={async () => {
            setLoadingId(payout.id);
            setOpen(await fetchStatement(payout.id));
            setLoadingId(null);
          }}
          className="mb-4 block w-full border border-hair bg-l1 p-4 text-start transition-colors duration-base ease-out hover:border-brass lg:p-5"
        >
          <div className="flex items-baseline justify-between">
            <span className="latin text-caption tracking-label text-brass">{payout.reference}</span>
            <span className="text-caption text-faint">
              <Period start={payout.periodStart} end={payout.periodEnd} />
            </span>
          </div>

          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-caption text-faint">صافي المستحق</span>
            <span className="text-h3 font-semibold lg:text-h2Lg">
              <span className="tnum">{formatPrice(payout.netPiastres)}</span>
              <span className="latin ms-2 text-caption tracking-label text-dim">{CURRENCY_LABEL}</span>
            </span>
          </div>

          {payout.disputeDeadline && (
            <p className="mt-3 text-micro leading-relaxed text-faint">
              يمكن الاعتراض حتى <DateText iso={payout.disputeDeadline} />
            </p>
          )}
        </button>
      ))}
    </div>
  );
}

function StatementView({ statement, onBack }: { statement: Statement; onBack(): void }) {
  return (
    <div className="px-5 lg:px-0">
      <button
        type="button"
        onClick={onBack}
        className="tappable mb-6 flex min-h-touch items-center text-caption tracking-label text-faint transition-colors duration-base ease-out hover:text-brass"
      >
        رجوع إلى الكشوف
      </button>

      <div className="border border-hair bg-l1 p-5">
        <div className="latin text-caption tracking-label text-brass">{statement.reference}</div>
        <div className="mt-2 text-caption text-faint">
          <Period start={statement.periodStart} end={statement.periodEnd} />
        </div>
      </div>

      {/*
        The arithmetic, in the order it happens. A house that can follow the
        subtraction does not have to trust it — which is the entire point of
        publishing a statement rather than a figure.
      */}
      <dl className="mt-6 border-t border-hair pt-5">
        <Row label="إجمالي المبيعات" piastres={statement.grossPiastres} />
        <Row label="عمولة المنصّة" piastres={-statement.commissionPiastres} />
        <div className="mt-4 flex items-baseline justify-between border-t border-hair pt-4">
          <dt className="font-display text-h4">الصافي</dt>
          <dd className="text-h3 font-semibold lg:text-h2Lg">
            <span className="tnum">{formatPrice(statement.netPiastres)}</span>
            <span className="latin ms-2 text-caption tracking-label text-dim">{CURRENCY_LABEL}</span>
          </dd>
        </div>
      </dl>

      <h2 className="mb-4 mt-9 border-b border-hair pb-3 font-display text-h3 lg:text-h2Lg">
        التفاصيل <span className="tnum text-faint">{num(statement.lines.length)}</span>
      </h2>

      {statement.lines.map((line) => (
        <div key={line.subOrderReference} className="mb-3 border border-hair bg-l1 p-4">
          <div className="flex items-baseline justify-between">
            <span className="latin text-caption tracking-label text-dim">
              {line.subOrderReference}
            </span>
            {/* The rate, on the line. A house comparing two lines can see why
                one cost more — which is what makes an attribution-based
                commission defensible rather than arbitrary. */}
            <span className="text-caption text-faint">
              <span className="tnum">{num(line.commissionBps / 100)}</span>%
            </span>
          </div>
          <div className="mt-3 flex justify-between text-small text-dim">
            <span>المبيعات</span>
            <span className="tnum">{formatPrice(line.grossPiastres)}</span>
          </div>
          <div className="flex justify-between text-small text-dim">
            <span>العمولة</span>
            <span className="tnum">−{formatPrice(line.commissionPiastres)}</span>
          </div>
          <div className="mt-2 flex justify-between border-t border-hair pt-2 text-bodyLg font-semibold">
            <span>الصافي</span>
            <span className="tnum">{formatPrice(line.netPiastres)}</span>
          </div>
          {/* Reported, never deducted — the customer paid it to the marketplace.
              Shown so the house can see the full economics of the order. */}
          <div className="mt-2 text-micro text-faint">
            تكلفة التوصيل <span className="tnum">{formatPrice(line.shippingPiastres)}</span>{' '}
            {CURRENCY_LABEL} — يتحمّلها العميل ولا تُخصم من مستحقّاتك
          </div>
        </div>
      ))}

      {statement.disputeDeadline && (
        <p className="mt-6 border-t border-hair pt-5 text-caption leading-relaxed text-faint">
          إن وجدت خطأً في هذا الكشف، يمكنك الاعتراض حتى{' '}
          <DateText iso={statement.disputeDeadline} />.
        </p>
      )}
    </div>
  );
}

function Row({ label, piastres }: { label: string; piastres: number }) {
  const negative = piastres < 0;
  return (
    <div className="flex justify-between py-1.5 text-small text-dim">
      <dt>{label}</dt>
      <dd>
        {negative && '−'}
        <span className="tnum">{formatPrice(Math.abs(piastres))}</span>
        <span className="latin ms-1.5 text-micro tracking-label">{CURRENCY_LABEL}</span>
      </dd>
    </div>
  );
}

/**
 * Dates are formatted with an explicit Gregorian calendar and Arabic-Indic
 * digits.
 *
 * `ar-EG` defaults to the Islamic calendar in some runtimes, which would show a
 * house a payout period it does not recognise. A statement is a financial
 * document; the calendar it uses is not a stylistic choice.
 */
const FORMAT = new Intl.DateTimeFormat('ar-EG-u-ca-gregory', {
  day: 'numeric', month: 'long', year: 'numeric',
});

function DateText({ iso }: { iso: string }) {
  return <span className="tnum">{FORMAT.format(new Date(iso))}</span>;
}

function Period({ start, end }: { start: string; end: string }) {
  return (
    <>
      <DateText iso={start} /> — <DateText iso={end} />
    </>
  );
}
