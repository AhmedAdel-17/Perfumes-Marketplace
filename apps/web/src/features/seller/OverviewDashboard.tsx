'use client';
import { localePath } from '@diyar/i18n';
import { useSellerCopy } from '@/features/seller/use-seller-copy';

import { useId, useState, type ReactNode } from 'react';
import { formatPrice, internal as num } from '@diyar/i18n';
import { buildOverviewPeriod, type OverviewMetricOrder } from './overview-model';

/** Interactive presentation over factual, seller-scoped order cohorts. */
export function OverviewDashboard({ orders, returnOrderIds, capturedAt, attention }: {
  orders: readonly OverviewMetricOrder[]; returnOrderIds: readonly string[]; capturedAt: string; attention?: ReactNode;
}) {
  const { locale, t } = useSellerCopy();

  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const [selected, setSelected] = useState<number | null>(null);
  const chartId = useId();
  const model = buildOverviewPeriod(orders, period, new Date(capturedAt), returnOrderIds);
  const maximum = Math.max(...model.daily.map(day => day.grossPiastres), 1);
  const point = (index: number, value: number) => ({ x: 30 + (index / Math.max(model.daily.length - 1, 1)) * 780, y: 210 - (value / maximum) * 170 });
  const points = model.daily.map((day, index) => point(index, day.grossPiastres));
  const path = points.map((p, index) => `${index ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
  const active = selected !== null ? model.daily[selected] : undefined;
  const label = (day: string) => new Intl.DateTimeFormat(locale==='en'?'en-GB':'ar-EG-u-ca-gregory', { day: 'numeric', month: 'short', timeZone: 'Africa/Cairo' }).format(new Date(`${day}T12:00:00Z`));
  const cards = [
    { title: t("Delivered merchandise"), value: `${formatPrice(model.grossPiastres)}${t(" EGP")}`, hint: `${num(model.deliveredCount)}${t(" orders delivered in this period with no recorded return")}` },
    { title: t("Orders placed"), value: num(model.placedCount), hint: t("All orders placed in this period, across all statuses") },
    { title: t("Average delivered order"), value: `${formatPrice(model.averagePiastres)}${t(" EGP")}`, hint: t("Merchandise value ÷ included delivered orders") },
  ];
  return <section aria-label={t("House performance for the selected period")} className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-display text-h2 text-ink">{t("House performance")}</h2><p className="mt-1 text-small text-ink2">{t("Selected period: last ")}{num(period)} {t(" days, including today in Cairo time.")}</p></div><label htmlFor={`${chartId}-period`} className="flex min-h-touch items-center gap-3 text-small text-ink2">{t("Period")}<select id={`${chartId}-period`} value={period} onChange={event => { setPeriod(Number(event.target.value) as 7 | 30 | 90); setSelected(null); }} className="min-h-touch border border-line bg-raised px-4 text-body text-ink"><option value={7}>{t("Last 7 days")}</option><option value={30}>{t("Last 30 days")}</option><option value={90}>{t("Last 90 days")}</option></select></label></div>
    <div className="grid gap-3 md:grid-cols-3">{cards.map(card => <section key={card.title} className="border border-line bg-raised p-4"><h3 className="text-small text-ink2">{card.title}</h3><p className="tnum mt-2 font-display text-h2 text-ink">{card.value}</p><p className="mt-2 text-small text-ink2">{card.hint}</p></section>)}</div>
    {attention}
    <div className="grid gap-5 xl:grid-cols-3">
      <section className="min-w-0 border border-line bg-raised p-5 xl:col-span-2"><h3 id={`${chartId}-title`} className="font-display text-h3 text-ink">{t("Delivered merchandise by day")}</h3><p className="mt-2 text-small text-ink2">{t("By actual delivery date, before commission, shipping and adjustments. Orders with any return record are excluded.")}</p><p aria-live="polite" className="mt-4 min-h-touch text-small text-ink2">{active ? `${label(active.day)}: ${formatPrice(active.grossPiastres)}${t(" EGP · ")}${num(active.orders)}${t(" delivered orders")}` : t("Hover over a point, or focus the chart and use the left and right arrows to explore each day.")}</p>
        <svg role="group" aria-labelledby={`${chartId}-title`} viewBox="0 0 840 240" className="block w-full text-accent focus:outline focus:outline-2 focus:outline-ink" tabIndex={0} onFocus={() => setSelected(model.daily.length - 1)} onBlur={() => setSelected(null)} onKeyDown={event => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); setSelected(index => event.key === "Home" ? 0 : event.key === "End" ? model.daily.length - 1 : Math.min(model.daily.length - 1, Math.max(0, (index ?? model.daily.length - 1) + (event.key === "ArrowLeft" ? -1 : 1)))); }}>
          <path d="M30 40 H810 M30 125 H810 M30 210 H810" className="stroke-line" fill="none" strokeWidth="1" />
          <path d={`${path} L810 210 L30 210 Z`} fill="currentColor" opacity="0.08" />
          <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
          {model.daily.map((day, index) => { const p = points[index]!; const description = `${label(day.day)}: ${formatPrice(day.grossPiastres)}${t(" EGP · ")}${num(day.orders)}${t(" delivered orders")}`; return <g key={day.day}><circle cx={p.x} cy={p.y} r={selected === index ? 5 : 3} fill="currentColor" /><circle cx={p.x} cy={p.y} r={12} fill="transparent" role="img" aria-label={description} onMouseEnter={() => setSelected(index)} onMouseLeave={() => setSelected(null)} className="focus:stroke-ink focus:outline-none"><title>{description}</title></circle></g>; })}
        </svg>
        <div className="flex justify-between gap-3 text-small text-ink2" dir="ltr"><span>{model.daily[0] ? label(model.daily[0].day) : ''}</span><span>{model.daily.at(-1) ? label(model.daily.at(-1)!.day) : ''}</span></div>
        {model.deliveredCount === 0 && <p className="mt-4 text-body text-ink2">{t("No eligible delivered orders in this period.")}</p>}
        <details className="mt-5 border-t border-line pt-3"><summary className="tappable flex min-h-touch cursor-pointer items-center text-small text-ink2">{t("Show daily data in a table")}</summary><div className="max-h-64 overflow-auto"><table className="w-full text-start text-small"><caption className="sr-only">{t("Daily delivered merchandise and orders in Cairo time")}</caption><thead><tr><th scope="col" className="border-b border-line py-3 text-start font-medium">{t("Date")}</th><th scope="col" className="border-b border-line py-3 text-start font-medium">{t("Delivered orders")}</th><th scope="col" className="border-b border-line py-3 text-start font-medium">{t("Merchandise value")}</th></tr></thead><tbody>{model.daily.map(day => <tr key={day.day}><th scope="row" className="border-b border-line py-3 text-start font-normal">{label(day.day)}</th><td className="tnum border-b border-line py-3">{num(day.orders)}</td><td className="tnum border-b border-line py-3">{formatPrice(day.grossPiastres)} {t(" EGP")}</td></tr>)}</tbody></table></div></details>
      </section>
      <section className="min-w-0 border border-line bg-raised p-5"><h3 className="font-display text-h3 text-ink">{t("Top perfumes")}</h3><p className="mt-2 text-small text-ink2">{t("By units in delivered orders during this period, with no recorded return.")}</p>{model.topProducts.length ? <ol className="mt-5 divide-y divide-line">{model.topProducts.map((product, index) => <li key={product.sku} className="flex items-start gap-3 py-4"><span className="tnum text-small text-ink2">{num(index + 1)}</span><div className="min-w-0 flex-1"><p className="break-words text-body text-ink">{product.name}</p><p dir="ltr" className="latin mt-1 break-all text-small text-ink2">{product.sku}</p></div><span className="shrink-0 text-small text-ink2">{num(product.quantity)} {t(" units")}</span></li>)}</ol> : <p className="py-8 text-body text-ink2">{t("No eligible delivered units in this period yet.")}</p>}<a href={localePath(locale,"/seller/listings")} className="tappable mt-4 inline-flex min-h-touch items-center text-small text-accent underline underline-offset-4">{t("Manage products")}</a></section>
    </div>
    <details className="border border-line bg-raised p-4 text-small text-ink2"><summary className="tappable flex min-h-touch cursor-pointer items-center">{t("How are these figures calculated?")}</summary><p className="mt-3">{t("Merchandise value, average, chart and top products use actual delivery dates for orders currently marked delivered. Orders with any return record or no delivery timestamp are excluded. Only orders placed uses creation dates across all statuses. Values are before commission, shipping and adjustments; they are not net revenue or an available balance. Averages are rounded to the nearest piastre. Returns and status changes may change these figures.")}</p></details>
  </section>;
}
