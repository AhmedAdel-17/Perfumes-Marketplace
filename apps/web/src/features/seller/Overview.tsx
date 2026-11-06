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
  let source;
  try {
    source = await Promise.all([fetchQueue(), fetchMyListings(), fetchReturnQueue()]);
  } catch {
    return <section role="alert" className="border border-line bg-raised p-6 text-body text-ink"><h2 className="font-display text-h3">تعذّر تحميل الملخص</h2><p className="mt-3 text-ink2">لم نعرض أصفارًا بدل البيانات غير المتاحة. حاول التحديث، أو افتح الطلبات مباشرة.</p><div className="mt-5 flex flex-wrap gap-3"><a href="/seller/overview" className="tappable inline-flex min-h-touch items-center border border-line px-5">إعادة المحاولة</a><a href="/seller/orders" className="tappable inline-flex min-h-touch items-center border border-line px-5">فتح الطلبات</a></div></section>;
  }
  const [orders, listings, returns] = source;
  if (!orders || !listings || !returns) return <p role="alert" className="border border-line p-6 text-body">انتهت الجلسة. <a href="/seller" className="link-line">سجّل الدخول مرة أخرى</a></p>;
  const now = new Date();
  const model = buildSellerOverview(orders, listings, returns, now);
  const stages = [
    { label: 'بانتظار التأكيد', value: model.awaiting }, { label: 'قيد التجهيز', value: model.preparing },
    { label: 'قيد التوصيل', value: model.dispatched }, { label: 'تم التوصيل', value: model.delivered },
  ];
  const largest = Math.max(...stages.map(stage => stage.value), 1);
  const stockAlerts = [...model.outOfStock, ...model.lowStock].slice(0, 6);
  const date = (value: string) => new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' }).format(new Date(value));
  return <div className="space-y-6">
    <OverviewDashboard orders={orders.map(({ id, reference, state, placedAt, deliveredAt, confirmDueAt, dispatchDueAt, merchandisePiastres, items }) => ({ id, reference, state, placedAt, deliveredAt, confirmDueAt, dispatchDueAt, merchandisePiastres, items }))} returnOrderIds={orders.filter(order => returns.some(item => item.subOrderReference === order.reference)).map(order => order.id)} capturedAt={now.toISOString()} attention={<section className="border border-line bg-raised"><h2 className="border-b border-line px-5 py-3 font-display text-h3">يحتاج انتباهك</h2><div className="divide-y divide-line">{[{count:model.awaiting,label:'طلبات تنتظر تأكيدك',href:'/seller/orders'},{count:model.lowStock.length+model.outOfStock.length,label:'منتجات تحتاج مراجعة المخزون',href:'/seller/listings'},{count:model.pendingReturns,label:'طلبات إرجاع تحتاج قرارًا',href:'/seller/returns'}].map(item=><a key={item.href} href={item.href} className="tappable flex min-h-touch items-center justify-between gap-4 px-5 py-3 text-body"><span><strong className="tnum me-3">{num(item.count)}</strong>{item.label}</span><span className="text-accent">مراجعة ←</span></a>)}</div></section>} />
    <h2 className="font-display text-h3 text-ink">يحتاج انتباهك الآن</h2>
    <details className="border border-line bg-raised p-5"><summary className="tappable flex min-h-touch cursor-pointer items-center justify-between text-bodyLg">التفاصيل التشغيلية والتنبيهات <span aria-hidden="true">+</span></summary><div className="mt-5 space-y-6">
    {model.overdue > 0 && <a href="/seller/orders" className="tappable block border border-danger bg-raised p-4 text-body text-ink"><strong className="font-medium">{num(model.overdue)} طلب تجاوز موعد التأكيد أو الشحن.</strong> راجع الطلبات ذات الأولوية الآن.</a>}
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="border border-line bg-raised p-5"><SectionTitle title="ابدأ بهذه الطلبات" href="/seller/orders" label="إدارة الطلبات" /><p className="mt-2 text-small text-ink2">الموعد الأقرب أولًا؛ حسب مهلة التأكيد أو الشحن الحالية.</p>
        {model.urgentOrders.length ? <ul className="mt-5 divide-y divide-line">{model.urgentOrders.map(order => {
          const due = order.state === 'confirmed' ? order.dispatchDueAt : order.confirmDueAt;
          const expired = due !== null && Date.parse(due) < now.getTime();
          return <li key={order.id} className="py-4"><a href={`/seller/orders#order-${order.id}`} className="tappable flex min-h-touch flex-wrap items-center justify-between gap-3"><span><span dir="ltr" className="latin block text-body text-ink">{order.reference}</span><span className="mt-1 block text-small text-ink2">{order.state === 'confirmed' ? 'جهّز الطلب وسجّل الشحنة' : 'راجع المخزون وأكّد الطلب'}</span></span><span className={`text-small ${expired ? 'text-danger' : 'text-ink2'}`}>{due ? `${expired ? 'تجاوز الموعد: ' : 'الموعد: '}${date(due)}` : 'لم يُحدّد موعد'}</span></a></li>;
        })}</ul> : <Empty text="لا توجد طلبات تنتظر تأكيدك أو شحنك الآن." />}
      </section>
      <section className="border border-line bg-raised p-5"><SectionTitle title="حركة الطلبات" href="/seller/orders" label="عرض الطلبات" /><p className="mt-2 text-small text-ink2">عدد الطلبات المسجّلة حاليًا بكل حالة، وليس مبيعات فترة محددة.</p>
        <div className="mt-6 space-y-5">{stages.map(stage => <div key={stage.label}><div className="mb-2 flex justify-between gap-3 text-small"><span className="text-ink2">{stage.label}</span><span className="tnum text-ink">{num(stage.value)}</span></div><meter min={0} max={largest} value={stage.value} aria-label={stage.label} className="block h-2 w-full accent-accent" /></div>)}</div><p className="mt-6 border-t border-line pt-4 text-small text-ink2">إجمالي السجل: <span className="tnum">{num(model.totalOrders)}</span> طلب، بما فيها الحالات الأخرى.</p>
      </section>
    </div>
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="border border-line bg-raised p-5"><SectionTitle title="المخزون الذي يحتاج انتباهك" href="/seller/listings" label="إدارة المنتجات" /><p className="mt-2 text-small text-ink2">المنتجات المنشورة فقط. التنبيه البصري عند ٥ وحدات أو أقل.</p>
        {stockAlerts.length ? <ul className="mt-5 divide-y divide-line">{stockAlerts.map(listing => <li key={listing.id}><a href={`/seller/listings/${listing.id}`} className="tappable flex min-h-touch items-center justify-between gap-3 py-4"><span className="text-body text-ink">{listing.name || 'منتج بلا اسم'}</span><span className={`text-small ${listing.stock <= 0 ? 'text-danger' : 'text-ink2'}`}>{listing.stock <= 0 ? 'نفد المخزون' : `${num(listing.stock)} وحدات مسجّلة`}</span></a></li>)}</ul> : <Empty text="لا توجد تنبيهات مخزون للمنتجات المنشورة." />}
        <p className="mt-4 border-t border-line pt-4 text-small text-ink2">{num(model.outOfStock.length)} نافد · {num(model.lowStock.length)} منخفض · راجع صفحة المنتجات للاطلاع على القائمة كاملة.</p>
      </section>
      <section className="border border-line bg-raised p-5"><SectionTitle title="آخر الطلبات" href="/seller/orders" label="كل الطلبات" />
        {model.recentOrders.length ? <ul className="mt-4 divide-y divide-line">{model.recentOrders.map(order => <li key={order.id}><a href={`/seller/orders#order-${order.id}`} className="tappable flex min-h-touch flex-wrap items-center justify-between gap-3 py-3"><span><span dir="ltr" className="latin block text-body text-ink">{order.reference}</span><span className="mt-1 block text-small text-ink2">{date(order.placedAt)}</span></span><span className="border border-line px-2 py-1 text-small text-ink2">{stateCopy(order.state).label}</span></a></li>)}</ul> : <Empty text="لم تصل طلبات بعد. ابدأ بتجهيز منتجاتك للنشر." />}
      </section>
    </div>
    <section className="border border-line bg-raised p-5"><h2 className="font-display text-h3 text-ink">متابعة الدار</h2><div className="mt-4 grid gap-4 md:grid-cols-3"><a href="/seller/listings" className="tappable block min-h-touch border border-line p-4 text-body">{num(model.published)} منتج منشور<span className="mt-2 block text-small text-ink2">{num(model.drafts)} مسودة · {num(model.moderation)} قيد المراجعة</span></a><a href="/seller/returns" className="tappable block min-h-touch border border-line p-4 text-body">{num(model.incomingReturns)} إرجاع معتمد أو في الطريق<span className="mt-2 block text-small text-ink2">تابع الاستلام من صفحة الإرجاعات.</span></a><a href="/seller/payouts" className="tappable block min-h-touch border border-line p-4 text-body">الكشوف والمستحقات<span className="mt-2 block text-small text-ink2">المعلومات المالية تظهر وفق صلاحية الحساب.</span></a></div></section>
    <p className="text-small text-ink2">المصدر: طلبات ومنتجات وإرجاعات دارك من النظام. لقطة عند تحميل الصفحة؛ الأعداد ليست إيرادات أو توقعات مالية. التوقيت: القاهرة.</p>
    </div></details>
  </div>;
}
function SectionTitle({ title, href, label }: { title: string; href: string; label: string }) {
  return <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-h3 text-ink">{title}</h2><a href={href} className="tappable inline-flex min-h-touch items-center text-small text-accent underline underline-offset-4">{label}</a></div>;
}
function Empty({ text }: { text: string }) { return <p className="py-8 text-body text-ink2">{text}</p>; }
