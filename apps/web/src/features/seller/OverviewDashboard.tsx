'use client';

import { useId, useState, type ReactNode } from 'react';
import { formatPrice, internal as num } from '@diyar/i18n';
import { buildOverviewPeriod, type OverviewMetricOrder } from './overview-model';

/** Interactive presentation over factual, seller-scoped order cohorts. */
export function OverviewDashboard({ orders, returnOrderIds, capturedAt, attention }: {
  orders: readonly OverviewMetricOrder[]; returnOrderIds: readonly string[]; capturedAt: string; attention?: ReactNode;
}) {
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const [selected, setSelected] = useState<number | null>(null);
  const chartId = useId();
  const model = buildOverviewPeriod(orders, period, new Date(capturedAt), returnOrderIds);
  const maximum = Math.max(...model.daily.map(day => day.grossPiastres), 1);
  const point = (index: number, value: number) => ({ x: 30 + (index / Math.max(model.daily.length - 1, 1)) * 780, y: 210 - (value / maximum) * 170 });
  const points = model.daily.map((day, index) => point(index, day.grossPiastres));
  const path = points.map((p, index) => `${index ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
  const active = selected !== null ? model.daily[selected] : undefined;
  const label = (day: string) => new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short', timeZone: 'Africa/Cairo' }).format(new Date(`${day}T12:00:00Z`));
  const cards = [
    { title: 'قيمة منتجات الطلبات المكتملة', value: `${formatPrice(model.grossPiastres)} ج.م`, hint: `${num(model.deliveredCount)} طلب وُصّل خلال الفترة، دون إرجاع مسجّل` },
    { title: 'الطلبات الواردة', value: num(model.placedCount), hint: 'كل الطلبات التي أُنشئت خلال الفترة، بجميع الحالات' },
    { title: 'متوسط قيمة الطلب المكتمل', value: `${formatPrice(model.averagePiastres)} ج.م`, hint: 'قيمة المنتجات ÷ عدد الطلبات المكتملة المحتسبة' },
  ];
  return <section aria-label="أداء الدار خلال الفترة" className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-display text-h2 text-ink">أداء الدار</h2><p className="mt-1 text-small text-ink2">الفترة المحددة: آخر {num(period)} يومًا، بما فيها اليوم بتوقيت القاهرة.</p></div><label htmlFor={`${chartId}-period`} className="flex min-h-touch items-center gap-3 text-small text-ink2">الفترة<select id={`${chartId}-period`} value={period} onChange={event => { setPeriod(Number(event.target.value) as 7 | 30 | 90); setSelected(null); }} className="min-h-touch border border-line bg-raised px-4 text-body text-ink"><option value={7}>آخر ٧ أيام</option><option value={30}>آخر ٣٠ يومًا</option><option value={90}>آخر ٩٠ يومًا</option></select></label></div>
    <div className="grid gap-3 md:grid-cols-3">{cards.map(card => <section key={card.title} className="border border-line bg-raised p-4"><h3 className="text-small text-ink2">{card.title}</h3><p className="tnum mt-2 font-display text-h2 text-ink">{card.value}</p><p className="mt-2 text-small text-ink2">{card.hint}</p></section>)}</div>
    {attention}
    <div className="grid gap-5 xl:grid-cols-3">
      <section className="min-w-0 border border-line bg-raised p-5 xl:col-span-2"><h3 id={`${chartId}-title`} className="font-display text-h3 text-ink">قيمة المنتجات الموصّلة يومًا بيوم</h3><p className="mt-2 text-small text-ink2">بحسب تاريخ التوصيل الفعلي؛ قبل العمولة والشحن والتسويات، مع استبعاد أي طلب له سجل إرجاع.</p><p aria-live="polite" className="mt-4 min-h-touch text-small text-ink2">{active ? `${label(active.day)}: ${formatPrice(active.grossPiastres)} ج.م · ${num(active.orders)} طلب موصّل` : 'مرّر على نقطة، أو ركّز الرسم واستخدم سهمي اليمين واليسار لمعرفة قيمة اليوم.'}</p>
        <svg role="group" aria-labelledby={`${chartId}-title`} viewBox="0 0 840 240" className="block w-full text-accent focus:outline focus:outline-2 focus:outline-ink" tabIndex={0} onFocus={() => setSelected(model.daily.length - 1)} onBlur={() => setSelected(null)} onKeyDown={event => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); setSelected(index => event.key === "Home" ? 0 : event.key === "End" ? model.daily.length - 1 : Math.min(model.daily.length - 1, Math.max(0, (index ?? model.daily.length - 1) + (event.key === "ArrowLeft" ? -1 : 1)))); }}>
          <path d="M30 40 H810 M30 125 H810 M30 210 H810" className="stroke-line" fill="none" strokeWidth="1" />
          <path d={`${path} L810 210 L30 210 Z`} fill="currentColor" opacity="0.08" />
          <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
          {model.daily.map((day, index) => { const p = points[index]!; const description = `${label(day.day)}: ${formatPrice(day.grossPiastres)} ج.م · ${num(day.orders)} طلب موصّل`; return <g key={day.day}><circle cx={p.x} cy={p.y} r={selected === index ? 5 : 3} fill="currentColor" /><circle cx={p.x} cy={p.y} r={12} fill="transparent" role="img" aria-label={description} onMouseEnter={() => setSelected(index)} onMouseLeave={() => setSelected(null)} className="focus:stroke-ink focus:outline-none"><title>{description}</title></circle></g>; })}
        </svg>
        <div className="flex justify-between gap-3 text-small text-ink2" dir="ltr"><span>{model.daily[0] ? label(model.daily[0].day) : ''}</span><span>{model.daily.at(-1) ? label(model.daily.at(-1)!.day) : ''}</span></div>
        {model.deliveredCount === 0 && <p className="mt-4 text-body text-ink2">لا توجد طلبات موصّلة محتسبة خلال هذه الفترة.</p>}
        <details className="mt-5 border-t border-line pt-3"><summary className="tappable flex min-h-touch cursor-pointer items-center text-small text-ink2">عرض تفاصيل الأيام في جدول</summary><div className="max-h-64 overflow-auto"><table className="w-full text-start text-small"><caption className="sr-only">قيمة المنتجات والطلبات الموصّلة لكل يوم بتوقيت القاهرة</caption><thead><tr><th scope="col" className="border-b border-line py-3 text-start font-medium">التاريخ</th><th scope="col" className="border-b border-line py-3 text-start font-medium">الطلبات الموصّلة</th><th scope="col" className="border-b border-line py-3 text-start font-medium">قيمة المنتجات</th></tr></thead><tbody>{model.daily.map(day => <tr key={day.day}><th scope="row" className="border-b border-line py-3 text-start font-normal">{label(day.day)}</th><td className="tnum border-b border-line py-3">{num(day.orders)}</td><td className="tnum border-b border-line py-3">{formatPrice(day.grossPiastres)} ج.م</td></tr>)}</tbody></table></div></details>
      </section>
      <section className="min-w-0 border border-line bg-raised p-5"><h3 className="font-display text-h3 text-ink">الأكثر طلبًا</h3><p className="mt-2 text-small text-ink2">بالوحدات في الطلبات الموصّلة خلال الفترة، دون إرجاع مسجّل.</p>{model.topProducts.length ? <ol className="mt-5 divide-y divide-line">{model.topProducts.map((product, index) => <li key={product.sku} className="flex items-start gap-3 py-4"><span className="tnum text-small text-ink2">{num(index + 1)}</span><div className="min-w-0 flex-1"><p className="break-words text-body text-ink">{product.name}</p><p dir="ltr" className="latin mt-1 break-all text-small text-ink2">{product.sku}</p></div><span className="shrink-0 text-small text-ink2">{num(product.quantity)} وحدة</span></li>)}</ol> : <p className="py-8 text-body text-ink2">لا توجد وحدات مكتملة محتسبة في هذه الفترة بعد.</p>}<a href="/seller/listings" className="tappable mt-4 inline-flex min-h-touch items-center text-small text-accent underline underline-offset-4">إدارة المنتجات</a></section>
    </div>
    <details className="border border-line bg-raised p-4 text-small text-ink2"><summary className="tappable flex min-h-touch cursor-pointer items-center">كيف نحتسب هذه الأرقام؟</summary><p className="mt-3">قيمة المنتجات والمتوسط والرسم والمنتجات الأكثر طلبًا مبنية على تاريخ التوصيل الفعلي، للطلبات التي حالتها الآن «تم التوصيل». نستبعد أي طلب له سجل إرجاع أو بلا تاريخ توصيل مسجّل. بطاقة الطلبات الواردة وحدها مبنية على تاريخ إنشاء الطلب وبجميع الحالات. القيم قبل العمولة والشحن والتسويات وليست صافي إيراد أو رصيدًا مستحقًا. المتوسط مقرب لأقرب قرش. قد تتغير الأرقام بعد الإرجاعات وتحديث حالات الطلبات.</p></details>
  </section>;
}
