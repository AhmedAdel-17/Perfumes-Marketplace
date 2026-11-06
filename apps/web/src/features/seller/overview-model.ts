/**
 * Presentation Model: operational summaries over the authenticated seller reads.
 * This intentionally does not estimate revenue or identify customers from parcel
 * recipients. Low-stock is a display cue (1–5 published units), not a stock rule.
 */
export interface OverviewOrder {
  readonly id: string;
  readonly reference: string;
  readonly state: string;
  readonly placedAt: string;
  readonly confirmDueAt: string | null;
  readonly dispatchDueAt: string | null;
}
export interface OverviewListing {
  readonly id: string;
  readonly name: string;
  readonly state: string;
  readonly stock: number;
}
export interface OverviewReturn { readonly state: string }

export function buildSellerOverview(
  orders: readonly OverviewOrder[], listings: readonly OverviewListing[],
  returns: readonly OverviewReturn[], now: Date,
) {
  const awaiting = orders.filter(order => order.state === 'placed' || order.state === 'awaiting_seller');
  const preparing = orders.filter(order => order.state === 'confirmed');
  const actionable = [...awaiting, ...preparing];
  const due = (order: OverviewOrder) => order.state === 'confirmed' ? order.dispatchDueAt : order.confirmDueAt;
  const deadline = (order: OverviewOrder) => {
    const value = due(order);
    return value ? new Date(value).getTime() : Number.POSITIVE_INFINITY;
  };
  const published = listings.filter(listing => listing.state === 'published');
  return {
    awaiting: awaiting.length,
    preparing: preparing.length,
    dispatched: orders.filter(order => order.state === 'dispatched').length,
    delivered: orders.filter(order => order.state === 'delivered').length,
    overdue: actionable.filter(order => deadline(order) < now.getTime()).length,
    pendingReturns: returns.filter(item => item.state === 'requested').length,
    incomingReturns: returns.filter(item => item.state === 'approved' || item.state === 'in_transit').length,
    published: published.length,
    drafts: listings.filter(listing => listing.state === 'draft').length,
    moderation: listings.filter(listing => listing.state === 'pending_moderation').length,
    outOfStock: published.filter(listing => listing.stock <= 0),
    lowStock: published.filter(listing => listing.stock > 0 && listing.stock <= 5).sort((a, b) => a.stock - b.stock),
    urgentOrders: actionable.sort((a, b) => deadline(a) - deadline(b)).slice(0, 5),
    recentOrders: [...orders].sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt)).slice(0, 5),
    totalOrders: orders.length,
  };
}

export interface OverviewMetricOrder extends OverviewOrder {
  readonly deliveredAt?: string | null;
  readonly merchandisePiastres: number;
  readonly items: readonly { readonly sku: string; readonly name: string; readonly quantity: number }[];
}
/** Cairo calendar periods; delivery values and placed-order counts use their own event dates. */
export function cairoDay(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value ?? '').join('-');
}
export function buildOverviewPeriod(orders: readonly OverviewMetricOrder[], days: 7 | 30 | 90, now: Date, excludedReturnOrderIds: readonly string[] = []) {
  const today = cairoDay(now);
  const calendarAnchor = new Date(`${today}T12:00:00Z`);
  const daily = Array.from({ length: days }, (_, index) => {
    const day = new Date(calendarAnchor);
    day.setUTCDate(day.getUTCDate() - days + index + 1);
    return { day: cairoDay(day), orders: 0, grossPiastres: 0 };
  });
  const dayMap = new Map(daily.map(day => [day.day, day]));
  const cohort = orders.filter(order => {
    const placed = new Date(order.placedAt);
    return placed.getTime() <= now.getTime() && dayMap.has(cairoDay(placed));
  });

  const excluded = new Set(excludedReturnOrderIds);
  const delivered = orders.filter(order => {
    if (order.state !== 'delivered' || excluded.has(order.id) || !order.deliveredAt) return false;
    const at = new Date(order.deliveredAt);
    return at.getTime() <= now.getTime() && dayMap.has(cairoDay(at));
  });
  for (const order of delivered) {
    const day = dayMap.get(cairoDay(new Date(order.deliveredAt!)));
    if (day) { day.orders++; day.grossPiastres += order.merchandisePiastres; }
  }
  const grossPiastres = delivered.reduce((sum, order) => sum + order.merchandisePiastres, 0);
  const products = new Map<string, { sku: string; name: string; quantity: number }>();
  for (const order of delivered) for (const item of order.items) {
    const current = products.get(item.sku);
    if (current) current.quantity += item.quantity;
    else products.set(item.sku, { sku: item.sku, name: item.name, quantity: item.quantity });
  }
  return { daily, placedCount: cohort.length, deliveredCount: delivered.length, grossPiastres,
    averagePiastres: delivered.length ? Math.round(grossPiastres / delivered.length) : 0,
    topProducts: [...products.values()].sort((a, b) => b.quantity - a.quantity || a.sku.localeCompare(b.sku)).slice(0, 5) };
}
