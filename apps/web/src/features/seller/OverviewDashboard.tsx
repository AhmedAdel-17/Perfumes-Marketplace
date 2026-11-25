'use client';
import styles from './overview-dashboard.module.css';
import {motion,useReducedMotion} from 'framer-motion';
import {SellerAreaChart} from './SellerAreaChart';
import { localePath } from '@diyar/i18n';
import { useSellerCopy } from '@/features/seller/use-seller-copy';

import { useId, useState, type ReactNode } from 'react';
import { formatPrice, internal as num } from '@diyar/i18n';
import { buildOverviewPeriod, type OverviewMetricOrder } from './overview-model';

/** Interactive presentation over factual, seller-scoped order cohorts. */
export function OverviewDashboard({ orders, returnOrderIds, capturedAt, attention, photos = {} }: {
  orders: readonly OverviewMetricOrder[]; returnOrderIds: readonly string[]; capturedAt: string; attention?: ReactNode; photos?:Readonly<Record<string,{url:string;alt:string}>>;
}) {
  const { locale, t } = useSellerCopy();

  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const reduced=useReducedMotion();
  const chartId = useId();
  const model = buildOverviewPeriod(orders, period, new Date(capturedAt), returnOrderIds);
  const label = (day: string) => new Intl.DateTimeFormat(locale==='en'?'en-GB':'ar-EG-u-ca-gregory', { day: 'numeric', month: 'short', timeZone: 'Africa/Cairo' }).format(new Date(`${day}T12:00:00Z`));
  const cards = [
    { title: t("Delivered merchandise"), value: `${formatPrice(model.grossPiastres)}${t(" EGP")}`, hint: `${num(model.deliveredCount)}${t(" orders delivered in this period with no recorded return")}` },
    { title: t("Orders placed"), value: num(model.placedCount), hint: t("All orders placed in this period, across all statuses") },
    { title: t("Average delivered order"), value: `${formatPrice(model.averagePiastres)}${t(" EGP")}`, hint: t("Merchandise value ÷ included delivered orders") },
  ];
  return <section aria-label={t("House performance for the selected period")} className={styles.dashboard}>
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-display text-h2 text-ink">{t("House performance")}</h2><p className="mt-1 text-small text-ink2">{t("Selected period: last ")}{num(period)} {t(" days, including today in Cairo time.")}</p></div><label htmlFor={`${chartId}-period`} className="flex min-h-touch items-center gap-3 text-small text-ink2">{t("Period")}<select aria-label={t("Period")} id={`${chartId}-period`} value={period} onChange={event => { setPeriod(Number(event.target.value) as 7 | 30 | 90); }} className="min-h-touch border border-line bg-raised px-4 text-body text-ink"><option value={7}>{t("Last 7 days")}</option><option value={30}>{t("Last 30 days")}</option><option value={90}>{t("Last 90 days")}</option></select></label></div>
    <div className={styles.metrics}>{cards.map((card,index)=><motion.section key={card.title} className={styles.metric} initial={reduced?false:{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{duration:reduced?0:0.45,delay:reduced?0:index*0.07,ease:[0.16,1,0.3,1]}} whileHover={reduced?{}:{y:-2}}><div className={styles.metricHeading}><h3>{card.title}</h3><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">{index===0?<><path d="M5 7h14v14H5z M8 8V6a4 4 0 0 1 8 0v2"/></>:index===1?<><path d="m12 3 9 5-9 5-9-5 9-5Z M3 8v9l9 5 9-5V8 M12 13v9"/></>:<><path d="M3 7h12l6 6-8 8-10-10V7Z"/><circle cx="8" cy="11" r="1"/></>}</svg></div><p className="tnum mt-2 font-display text-h2 text-ink">{card.value}</p><span className={styles.periodPill}>{period===7?t('Last 7 days'):period===30?t('Last 30 days'):t('Last 90 days')}</span><p className="mt-2 text-small text-ink2">{card.hint}</p></motion.section>)}</div>
    <div className={styles.middle}>
      <section className={styles.chart}><h3 id={`${chartId}-title`} className="font-display text-h3 text-ink">{t("Delivered merchandise by day")}</h3><p className="mt-2 text-small text-ink2">{t("By actual delivery date, before commission, shipping and adjustments. Orders with any return record are excluded.")}</p><p className={styles.chartStatus}>{t('Chart values in EGP. Hover or use arrow keys for daily details.')}</p>
        <SellerAreaChart daily={model.daily}/>
        {model.deliveredCount === 0 && <p className="mt-4 text-body text-ink2">{t("No eligible delivered orders in this period.")}</p>}
        <details className="mt-5 border-t border-line pt-3"><summary className="tappable flex min-h-touch cursor-pointer items-center text-small text-ink2">{t("Show daily data in a table")}</summary><div className="max-h-64 overflow-auto"><table className="w-full text-start text-small"><caption className="sr-only">{t("Daily delivered merchandise and orders in Cairo time")}</caption><thead><tr><th scope="col" className="border-b border-line py-3 text-start font-medium">{t("Date")}</th><th scope="col" className="border-b border-line py-3 text-start font-medium">{t("Delivered orders")}</th><th scope="col" className="border-b border-line py-3 text-start font-medium">{t("Merchandise value")}</th></tr></thead><tbody>{model.daily.map(day => <tr key={day.day}><th scope="row" className="border-b border-line py-3 text-start font-normal">{label(day.day)}</th><td className="tnum border-b border-line py-3">{num(day.orders)}</td><td className="tnum border-b border-line py-3">{formatPrice(day.grossPiastres)} {t(" EGP")}</td></tr>)}</tbody></table></div></details>
      </section>
      {attention&&<div className={styles.attention}>{attention}</div>}
      <section className={styles.topProducts}><h3 className="font-display text-h3 text-ink">{t("Top perfumes")}</h3><p className="mt-2 text-small text-ink2">{t("By units in delivered orders during this period, with no recorded return.")}</p>{model.topProducts.length ? <ol className="mt-5 divide-y divide-line">{model.topProducts.map((product, index) => <li key={product.sku} className="flex items-start gap-3 py-4"><span className="tnum text-small text-ink2">{num(index + 1)}</span><>{photos[product.sku]&&<img src={photos[product.sku]!.url} alt={photos[product.sku]!.alt} width={44} height={56} className="h-14 w-11 shrink-0 rounded-control border border-line object-contain"/>}</><div className="min-w-0 flex-1"><p className="break-words text-body text-ink">{product.name}</p><p dir="ltr" className="latin mt-1 break-all text-small text-ink2">{product.sku}</p></div><span className="shrink-0 text-small text-ink2">{num(product.quantity)} {t(" units")}</span></li>)}</ol> : <p className="py-8 text-body text-ink2">{t("No eligible delivered units in this period yet.")}</p>}<a href={localePath(locale,"/seller/listings")} className="tappable mt-4 inline-flex min-h-touch items-center text-small text-accent underline underline-offset-4">{t("Manage products")}</a></section>
    </div>
    <details className={styles.methodology}><summary className="tappable flex min-h-touch cursor-pointer items-center">{t("How are these figures calculated?")}</summary><p className="mt-3">{t("Merchandise value, average, chart and top products use actual delivery dates for orders currently marked delivered. Orders with any return record or no delivery timestamp are excluded. Only orders placed uses creation dates across all statuses. Values are before commission, shipping and adjustments; they are not net revenue or an available balance. Averages are rounded to the nearest piastre. Returns and status changes may change these figures.")}</p></details>
  </section>;
}
