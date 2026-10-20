/**
 * What the owner sees — doc 04 §8 gate 8.
 *
 * A SERVER component with no client JavaScript: the period switch is links, so
 * every view is a URL an owner can send to a partner. Every figure arrives
 * computed; nothing on this screen does arithmetic beyond turning a rate into
 * a percentage for reading.
 *
 * THE ORDER IS THE ORDER OF THE QUESTIONS. Is money coming in — and how much of
 * it is actually in hand. Where do orders stop. Which houses keep their word.
 * Where do parcels come back. Where do customers come from. And what the
 * system cannot yet tell you, stated as plainly as what it can.
 *
 * THREE THINGS IT REFUSES TO DO, per docs/ANALYTICS_DEFINITIONS.md:
 *  - show GMV without held GMV beside it;
 *  - show a rate over zero orders as 0% (it shows —);
 *  - show an unrecorded cost as zero (it says it is not recorded).
 */
import type { ReactNode } from 'react';
import {
  BROWSING_EVENT_AR,
  CONTRIBUTION_INPUT_AR, CURRENCY_LABEL, EXIT_STATE_AR, FUNNEL_STAGE_AR, GOVERNORATE_AR,
  INPUT_STATUS_AR, ORDER_SOURCE_AR, REASON_CODE_AR, TIME, VISITOR,
  counted, formatPrice, internal as num, internalDate,
} from '@diyar/i18n';
import type { fetchOwnerReport } from './insights-actions';

type Loaded = Extract<NonNullable<Awaited<ReturnType<typeof fetchOwnerReport>>>, { ok: true }>;
export type OwnerReportView = Loaded['report'];

type RateView = { numerator: number; denominator: number };

// Western digits: an operating tool, so the internal register (numerals.ts).
const PERIOD_LABEL: Readonly<Record<number, string>> = {
  1: 'اليوم',
  7: '7 أيام',
  30: '30 يومًا',
  90: '90 يومًا',
};

const words = (map: Readonly<Record<string, string>>, key: string) => map[key] ?? key;

function Money({ piastres }: { piastres: number }) {
  return (
    <>
      <span className="tnum">{formatPrice(piastres)}</span>
      <span className="latin ms-1.5 text-micro tracking-label text-ink3">{CURRENCY_LABEL}</span>
    </>
  );
}

/** A rate, or a dash when there was nothing to measure. Never 0% for "no orders". */
function Rate({ rate }: { rate: RateView }) {
  if (rate.denominator === 0) {
    return <span className="text-ink3" title="لا طلبات تُقاس بعد">—</span>;
  }
  const percent = Math.round((rate.numerator / rate.denominator) * 100);
  return (
    <span className="whitespace-nowrap">
      <bdi dir="ltr" className="tnum text-ink">{num(percent)}%</bdi>
      <span className="ms-1.5 text-small text-ink3">
        <bdi dir="ltr" className="tnum">{num(rate.numerator)}/{num(rate.denominator)}</bdi>
      </span>
    </span>
  );
}

function Minutes({ value }: { value: number | null }) {
  if (value === null) return <span className="text-ink3">—</span>;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return (
    <span className="tnum whitespace-nowrap">
      {hours > 0 && <>{num(hours)} <span className="text-small">س</span> </>}
      {num(minutes)} <span className="text-small">د</span>
    </span>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="py-7">
      {/* The register's section head: a full-strength rule UNDER the title,
          as on every other screen, rather than a hairline above it. */}
      <h2 className="border-b border-ink pb-2 font-display text-h3 lg:text-h2">{title}</h2>
      {note && <p className="mt-2 max-w-proseMax text-small leading-relaxed text-ink3">{note}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/**
 * Wide tables scroll inside their own box; the page body never does.
 *
 * The box is FOCUSABLE and named. On a phone the table is wider than the
 * screen, and a scroll region that only a finger or a mouse can move hides
 * every column past the third from someone using a keyboard — the house SLA
 * figures included. Tab reaches it, the arrow keys scroll it, and a screen
 * reader announces which table it is.
 */
function Table({ label, head, children }: {
  label: string;
  head: readonly string[];
  children: ReactNode;
}) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto">
      <table className="w-full min-w-proseMax border-collapse text-small">
        <thead>
          <tr className="border-b border-line text-start">
            {head.map((label) => (
              <th key={label} scope="col" className="py-2 pe-4 text-start text-small font-normal text-ink3">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function OwnerReport({ report }: { report: OwnerReportView }) {
  const f = report.funnel;
  const exits = (Object.keys(f.exits) as Array<keyof typeof f.exits>).filter((k) => f.exits[k].total > 0);

  return (
    <div className="px-5 lg:px-0">
      <nav aria-label="الفترة" className="flex flex-wrap items-center gap-x-5 border-b border-line pb-3">
        {report.periods.map((days) => (
          <a
            key={days}
            href={`/ops/insights?days=${days}`}
            aria-current={report.days === days ? 'page' : undefined}
            className={[
              'tappable inline-flex min-h-touch min-w-touch items-center justify-center border-b pb-0.5 text-small',
              'transition-colors duration-base ease-out hover:text-accent',
              report.days === days ? 'border-accent text-ink' : 'border-transparent text-ink3',
            ].join(' ')}
          >
            {PERIOD_LABEL[days] ?? days}
          </a>
        ))}
        <p className="ms-auto text-small text-ink3">
          من <time dateTime={report.from}>{internalDate(report.from, { time: true })}</time>
          {' '}إلى <time dateTime={report.to}>{internalDate(report.to, { time: true })}</time>
          {' '}· بتوقيت القاهرة
        </p>
      </nav>

      {/* ---------------------------------------------------------- money */}
      <Section
        title="المال"
        note="المكتمل هو ما تعتبره كشوف الدور مستحقًّا: سُلّم، وحُصّل مبلغه، وانتهت مهلة الإرجاع. ما سُلّم ولم يستحق بعد يظهر بجانبه، لا داخله."
      >
        <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          <Figure label="قيمة المبيعات المكتملة"><Money piastres={report.gmvPiastres} /></Figure>
          <Figure label="سُلّمت ولم تُستحق بعد"><Money piastres={report.heldGmvPiastres} /></Figure>
          <Figure label="إيراد المنصّة"><Money piastres={report.platformRevenuePiastres} /></Figure>
          <Figure label="نسبة العمولة الفعلية">
            {report.gmvPiastres === 0
              ? <span className="text-ink3">—</span>
              : <bdi dir="ltr" className="tnum">{(report.effectiveTakeRateBps / 100).toFixed(1)}%</bdi>}
          </Figure>
          <Figure label="طلبات مكتملة"><span className="tnum">{num(report.completedOrders)}</span></Figure>
          <Figure label="متوسط قيمة الطلب">
            {report.aovPiastres === null
              ? <span className="text-ink3">—</span>
              : <Money piastres={report.aovPiastres} />}
          </Figure>
        </dl>
      </Section>

      {/* ------------------------------------------------------ pre-order */}
      <Section
        title="قبل الطلب"
        note="ما فعله الزوّار قبل أن يصير أي طلب. «زوّار» تحسب الشخص مرّة واحدة مهما كرّر، و«مرات» تحسب كل مرّة — الشخص الذي فتح صفحة عطر عشرين مرّة زائر واحد نظر، لا عشرون لم يشتروا. لا نحتفظ بكلمات البحث، ولا نربط هذا بأي حساب."
      >
        {report.preOrder.isEmpty ? (
          <p className="text-small text-ink3">لم يُسجَّل نشاط تصفّح في هذه الفترة.</p>
        ) : (
          <ol className="grid grid-cols-1 gap-y-2 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-5">
            {report.preOrder.stages.map((stage) => (
              <li
                key={stage.event}
                className="flex items-baseline justify-between gap-3 border-b border-line py-2 sm:block sm:border-b-0 sm:border-s sm:ps-4"
              >
                <span className="text-small text-ink3">
                  {BROWSING_EVENT_AR[stage.event]}
                </span>
                <span className="block">
                  {/*
                    Both figures through `counted`. This read "٣ مرّة" — the noun
                    written once, in the singular, beside a number that varies —
                    which is the exact mistake `@diyar/i18n` exists to prevent,
                    made in new code by the person who wrote the module. The
                    visitor figure carries its own noun for a second reason: a
                    bare number needed the section's prose to mean anything.
                  */}
                  <span className="block text-h3 text-ink">
                    {counted(stage.visitors, VISITOR, num)}
                  </span>
                  <span className="mt-0.5 block text-small text-ink3">
                    {counted(stage.events, TIME, num)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>

      {/* --------------------------------------------------------- funnel */}
      <Section
        title="مسار الطلبات"
        note="كل مرحلة تُحسب لما وصل إليها، لا لما يقف عندها الآن. طلبات هذه الفترة فقط."
      >
        <ol className="grid grid-cols-1 gap-y-2 sm:grid-cols-5 sm:gap-x-4">
          {(['placed', 'confirmed', 'dispatched', 'delivered', 'completed'] as const).map((stage) => (
            <li key={stage} className="flex items-baseline justify-between gap-3 border-b border-line py-2 sm:block sm:border-b-0 sm:border-s sm:ps-4">
              <span className="text-small text-ink3">{FUNNEL_STAGE_AR[stage]}</span>
              <span className="tnum block text-h3 text-ink">{num(f[stage])}</span>
            </li>
          ))}
        </ol>

        {exits.length > 0 ? (
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {exits.map((state) => (
              <div key={state}>
                <h3 className="text-small text-ink">
                  {EXIT_STATE_AR[state]} <span className="tnum text-ink3">· {num(f.exits[state].total)}</span>
                </h3>
                <ul className="mt-2">
                  {Object.entries(f.exits[state].byReason)
                    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
                    .map(([reason, count]) => (
                      <li key={reason} className="flex items-baseline justify-between gap-3 py-1 text-small text-ink2">
                        <span>{words(REASON_CODE_AR, reason)}</span>
                        <span className="tnum">{num(count ?? 0)}</span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-5 text-small text-ink3">لم يخرج أي طلب من المسار في هذه الفترة.</p>
        )}
      </Section>

      {/* ------------------------------------------------------------ SLA */}
      <Section
        title="التزام الدور"
        note="الردّ في الموعد يشمل الاعتذار السريع — الدار التي تعتذر فورًا عن طلب لا تستطيع تنفيذه وفت بوعدها. الطلب الذي ما زال أمامه وقت لا يُحسب في أيٍّ من الخانتين."
      >
        {report.sla.length === 0 ? (
          <p className="text-small text-ink3">لا طلبات في هذه الفترة.</p>
        ) : (
          <Table label="التزام الدور" head={['الدار', 'طلبات', 'ردّت في الموعد', 'متأخرة بلا ردّ', 'وسيط زمن الردّ', 'شُحنت في الموعد', 'متأخرة بلا شحن', 'اعتذار', 'رفض استلام', 'إرجاع']}>
            {report.sla.map((row) => (
              <tr key={row.sellerId} className="border-b border-line align-baseline">
                <th scope="row" className="py-3 pe-4 text-start font-normal text-ink">{row.houseName}</th>
                <td className="tnum py-3 pe-4">{num(row.placed)}</td>
                <td className="py-3 pe-4"><Rate rate={row.answeredOnTime} /></td>
                <td className={`tnum py-3 pe-4 ${row.unansweredPastDeadline > 0 ? 'text-danger' : 'text-ink3'}`}>
                  {num(row.unansweredPastDeadline)}
                </td>
                <td className="py-3 pe-4"><Minutes value={row.medianMinutesToAnswer} /></td>
                <td className="py-3 pe-4"><Rate rate={row.dispatchedOnTime} /></td>
                <td className={`tnum py-3 pe-4 ${row.unshippedPastDeadline > 0 ? 'text-danger' : 'text-ink3'}`}>
                  {num(row.unshippedPastDeadline)}
                </td>
                <td className="py-3 pe-4"><Rate rate={row.rejection} /></td>
                <td className="py-3 pe-4"><Rate rate={row.refusal} /></td>
                <td className="py-3 pe-4"><Rate rate={row.returns} /></td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {/* ------------------------------------------------------- refusals */}
      <Section
        title="رفض الاستلام حسب المحافظة"
        note="من الشحنات التي خرجت فعلًا. التوصيل الفاشل تكلفة حقيقية، وتختلف من منطقة لأخرى."
      >
        {report.refusalByGovernorate.length === 0 ? (
          <p className="text-small text-ink3">لم تُشحن طلبات في هذه الفترة.</p>
        ) : (
          <ul className="max-w-proseMax">
            {report.refusalByGovernorate.map((row) => (
              <li key={row.governorate} className="flex items-baseline justify-between gap-3 border-b border-line py-2 text-small">
                <span className="text-ink2">{words(GOVERNORATE_AR, row.governorate)}</span>
                <Rate rate={row} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* --------------------------------------------------------- source */}
      <Section
        title="مصدر الطلبات المكتملة"
        note="المصدر الذي تُحسب عليه العمولة لكل دار، لا تصنيف الطلب العام."
      >
        {report.sourceMix.length === 0 ? (
          <p className="text-small text-ink3">لا مبيعات مكتملة في هذه الفترة.</p>
        ) : (
          <ul className="max-w-proseMax">
            {report.sourceMix.map((row) => (
              <li key={row.source} className="flex items-baseline justify-between gap-3 border-b border-line py-2 text-small">
                <span className="text-ink2">{words(ORDER_SOURCE_AR, row.source)}</span>
                <span className="whitespace-nowrap">
                  <Money piastres={row.gmvPiastres} />
                  <span className="ms-2 text-small text-ink3">· <span className="tnum">{num(row.subOrders)}</span></span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* --------------------------------------------------- contribution */}
      <Section
        title="مدخلات هامش المساهمة"
        note="الهامش لا يُعرض حتى تُسجَّل تكلفة الدفع والتحصيل. هامش محسوب من نصف بنوده رقم مختلف يحمل اسم الهامش."
      >
        <ul className="max-w-proseMax">
          {report.contributionInputs.map((input) => (
            <li key={input.key} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line py-3">
              <span className="text-small text-ink">{words(CONTRIBUTION_INPUT_AR, input.key)}</span>
              <span className="flex items-baseline gap-3">
                <InputValue input={input} />
                <span className="text-small text-ink3">{words(INPUT_STATUS_AR, input.status)}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-small text-ink3">{label}</dt>
      <dd className="mt-1 text-h3 text-ink">{children}</dd>
    </div>
  );
}

function InputValue({ input }: { input: OwnerReportView['contributionInputs'][number] }) {
  if (input.status === 'not_recorded') {
    // A dash, never a figure: the status beside it says "لم يُسجَّل بعد" in
    // words, and a 0 here would be read as a measured zero cost.
    return <span className="text-small text-ink3">—</span>;
  }
  if (input.status === 'count_only') {
    return <span className="tnum text-small text-ink">{num(input.count ?? 0)}</span>;
  }
  return <span className="text-small text-ink"><Money piastres={input.amountPiastres ?? 0} /></span>;
}
