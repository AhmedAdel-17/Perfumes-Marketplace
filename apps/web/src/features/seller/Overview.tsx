import { localePath } from '@diyar/i18n';
import { sellerText } from '@diyar/i18n';
import { getLocale } from '@/core/locale';
import { internal as num, stateCopy } from '@diyar/i18n';
import { fetchQueue } from './actions';
import { fetchMyListings } from './listing-actions';
import { fetchReturnQueue } from './return-actions';
import { buildSellerOverview } from './overview-model';
import { OverviewDashboard } from './OverviewDashboard';

/**
 * Server-side Presentation Model: existing authenticated read paths feed a
 * task-oriented overview. No recipient identities, inferred customer rankings,
 * estimated revenue or invented comparison periods reach this surface.
 */
export async function Overview() {
  const locale = await getLocale(); const t = (value: string) => sellerText(locale,value);

  let source;
  try {
    source = await Promise.all([fetchQueue(), fetchMyListings(), fetchReturnQueue()]);
  } catch {
    return <section role="alert" className="border border-line bg-raised p-6 text-body text-ink"><h2 className="font-display text-h3">{t("Could not load the overview")}</h2><p className="mt-3 text-ink2">{t("Unavailable data is not shown as zero. Try refreshing or open orders directly.")}</p><div className="mt-5 flex flex-wrap gap-3"><a href={localePath(locale,"/seller/overview")} className="tappable inline-flex min-h-touch items-center border border-line px-5">{t("Try again")}</a><a href={localePath(locale,"/seller/orders")} className="tappable inline-flex min-h-touch items-center border border-line px-5">{t("Open orders")}</a></div></section>;
  }
  const [orders, listings, returns] = source;
  if (!orders || !listings || !returns) return <p role="alert" className="border border-line p-6 text-body">{t("Your session has expired. ")}<a href={localePath(locale,"/seller")} className="link-line">{t("Sign in again")}</a></p>;
  const now = new Date();
  const model = buildSellerOverview(orders, listings, returns, now);
  const stages = [
    { label: t("Awaiting confirmation"), value: model.awaiting }, { label: t("Preparing"), value: model.preparing },
    { label: t("In delivery"), value: model.dispatched }, { label: t("Delivered"), value: model.delivered },
  ];
  const largest = Math.max(...stages.map(stage => stage.value), 1);
  const stockAlerts = [...model.outOfStock, ...model.lowStock].slice(0, 6);
  const date = (value: string) => new Intl.DateTimeFormat(locale==='en'?'en-GB':'ar-EG-u-ca-gregory', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' }).format(new Date(value));
  return <div className="space-y-6">
    <OverviewDashboard orders={orders.map(({ id, reference, state, placedAt, deliveredAt, confirmDueAt, dispatchDueAt, merchandisePiastres, items }) => ({ id, reference, state, placedAt, deliveredAt, confirmDueAt, dispatchDueAt, merchandisePiastres, items }))} returnOrderIds={orders.filter(order => returns.some(item => item.subOrderReference === order.reference)).map(order => order.id)} photos={Object.fromEntries(listings.flatMap(listing=>listing.primaryPhoto ? [[listing.sku,{url:listing.primaryPhoto.url,alt:listing.primaryPhoto.alt}]] : []))} capturedAt={now.toISOString()} attention={<section className="border border-line bg-raised"><h2 className="border-b border-line px-5 py-3 font-display text-h3">{t("Needs your attention")}</h2><div className="divide-y divide-line">{[{count:model.awaiting,label:t("orders awaiting confirmation"),href:'/seller/orders'},{count:model.lowStock.length+model.outOfStock.length,label:t("products need a stock check"),href:'/seller/listings'},{count:model.pendingReturns,label:t("returns need a decision"),href:'/seller/returns'}].map(item=><a key={item.href} href={localePath(locale,item.href)} className="tappable flex min-h-touch items-center justify-between gap-4 px-5 py-3 text-body"><span><strong className="tnum me-3">{num(item.count)}</strong>{item.label}</span><span className="text-accent">{t("Review →")}</span></a>)}</div></section>} />
    <h2 className="font-display text-h3 text-ink">{t("Your operational details")}</h2>
    <details className="border border-line bg-raised p-5"><summary className="tappable flex min-h-touch cursor-pointer items-center justify-between text-bodyLg">{t("Operational details and alerts ")}<span aria-hidden="true">+</span></summary><div className="mt-5 space-y-6">
    {model.overdue > 0 && <a href={localePath(locale,"/seller/orders")} className="tappable block border border-danger bg-raised p-4 text-body text-ink"><strong className="font-medium">{num(model.overdue)} {t(" orders past their confirmation or dispatch deadline.")}</strong> {t(" Review priority orders now.")}</a>}
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="border border-line bg-raised p-5"><SectionTitle title={t("Start with these orders")} href={localePath(locale,"/seller/orders")} label={t("Manage orders")} /><p className="mt-2 text-small text-ink2">{t("Earliest confirmation or dispatch deadline first.")}</p>
        {model.urgentOrders.length ? <ul className="mt-5 divide-y divide-line">{model.urgentOrders.map(order => {
          const due = order.state === 'confirmed' ? order.dispatchDueAt : order.confirmDueAt;
          const expired = due !== null && Date.parse(due) < now.getTime();
          return <li key={order.id} className="py-4"><a href={localePath(locale,`/seller/orders#order-${order.id}`)} className="tappable flex min-h-touch flex-wrap items-center justify-between gap-3"><span><span dir="ltr" className="latin block text-body text-ink">{order.reference}</span><span className="mt-1 block text-small text-ink2">{order.state === 'confirmed' ? t("Prepare the order and record tracking") : t("Check stock and confirm the order")}</span></span><span className={`text-small ${expired ? 'text-danger' : 'text-ink2'}`}>{due ? `${expired ? t("Overdue:") : t("Due:")}${date(due)}` : t("No deadline recorded")}</span></a></li>;
        })}</ul> : <Empty text={t("No orders are awaiting confirmation or dispatch.")} />}
      </section>
      <section className="border border-line bg-raised p-5"><SectionTitle title={t("Order stages")} href={localePath(locale,"/seller/orders")} label={t("View orders")} /><p className="mt-2 text-small text-ink2">{t("Current order counts by status, across all periods.")}</p>
        <div className="mt-6 space-y-5">{stages.map(stage => <div key={stage.label}><div className="mb-2 flex justify-between gap-3 text-small"><span className="text-ink2">{stage.label}</span><span className="tnum text-ink">{num(stage.value)}</span></div><meter min={0} max={largest} value={stage.value} aria-label={stage.label} className="block h-2 w-full accent-accent" /></div>)}</div><p className="mt-6 border-t border-line pt-4 text-small text-ink2">{t("Total register: ")}<span className="tnum">{num(model.totalOrders)}</span> {t(" orders, including other statuses.")}</p>
      </section>
    </div>
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="border border-line bg-raised p-5"><SectionTitle title={t("Stock that needs attention")} href={localePath(locale,"/seller/listings")} label={t("Manage products")} /><p className="mt-2 text-small text-ink2">{t("Published products only. Stock alerts appear at 5 units or fewer.")}</p>
        {stockAlerts.length ? <ul className="mt-5 divide-y divide-line">{stockAlerts.map(listing => <li key={listing.id}><a href={localePath(locale,`/seller/listings/${listing.id}`)} className="tappable flex min-h-touch items-center justify-between gap-3 py-4"><span className="text-body text-ink">{listing.name || t("Untitled product")}</span><span className={`text-small ${listing.stock <= 0 ? 'text-danger' : 'text-ink2'}`}>{listing.stock <= 0 ? t("Out of stock") : `${num(listing.stock)}${t(" recorded units")}`}</span></a></li>)}</ul> : <Empty text={t("No stock alerts for published products.")} />}
        <p className="mt-4 border-t border-line pt-4 text-small text-ink2">{num(model.outOfStock.length)} {t(" out of stock · ")}{num(model.lowStock.length)} {t(" low stock · View products for the full list.")}</p>
      </section>
      <section className="border border-line bg-raised p-5"><SectionTitle title={t("Recent orders")} href={localePath(locale,"/seller/orders")} label={t("All orders")} />
        {model.recentOrders.length ? <ul className="mt-4 divide-y divide-line">{model.recentOrders.map(order => <li key={order.id}><a href={localePath(locale,`/seller/orders#order-${order.id}`)} className="tappable flex min-h-touch flex-wrap items-center justify-between gap-3 py-3"><span><span dir="ltr" className="latin block text-body text-ink">{order.reference}</span><span className="mt-1 block text-small text-ink2">{date(order.placedAt)}</span></span><span className="border border-line px-2 py-1 text-small text-ink2">{stateCopy(order.state,locale).label}</span></a></li>)}</ul> : <Empty text={t("No orders yet. Start by preparing your products for publication.")} />}
      </section>
    </div>
    <section className="border border-line bg-raised p-5"><h2 className="font-display text-h3 text-ink">{t("House activity")}</h2><div className="mt-4 grid gap-4 md:grid-cols-3"><a href={localePath(locale,"/seller/listings")} className="tappable block min-h-touch border border-line p-4 text-body">{num(model.published)} {t(" published products")}<span className="mt-2 block text-small text-ink2">{num(model.drafts)} {t(" drafts · ")}{num(model.moderation)} {t(" Under review")}</span></a><a href={localePath(locale,"/seller/returns")} className="tappable block min-h-touch border border-line p-4 text-body">{num(model.incomingReturns)} {t(" approved or incoming returns")}<span className="mt-2 block text-small text-ink2">{t("Track receipt on the returns page.")}</span></a><a href={localePath(locale,"/seller/payouts")} className="tappable block min-h-touch border border-line p-4 text-body">{t("Statements and payouts")}<span className="mt-2 block text-small text-ink2">{t("Financial information follows your account permissions.")}</span></a></div></section>
    <p className="text-small text-ink2">{t("Source: your house orders, products and returns. Snapshot at page load; counts are not revenue or forecasts. Cairo time.")}</p>
    </div></details>
  </div>;
}
function SectionTitle({ title, href, label }: { title: string; href: string; label: string }) {
  return <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-h3 text-ink">{title}</h2><a href={href} className="tappable inline-flex min-h-touch items-center text-small text-accent underline underline-offset-4">{label}</a></div>;
}
function Empty({ text }: { text: string }) { return <p className="py-8 text-body text-ink2">{text}</p>; }
