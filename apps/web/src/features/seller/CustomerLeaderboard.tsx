'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { internal as num, localePath } from '@diyar/i18n';
import { useSellerCopy } from './use-seller-copy';
import { fetchCustomerLeaderboard, fetchCustomerProfile } from './customer-actions';
type Ranking = NonNullable<Awaited<ReturnType<typeof fetchCustomerLeaderboard>>>;
type ProfileResult = NonNullable<Awaited<ReturnType<typeof fetchCustomerProfile>>>;
const button = 'tappable inline-flex min-h-touch items-center justify-center border border-line px-4 text-small text-ink2 transition-colors hover:border-accent hover:text-accent disabled:opacity-disabled focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

/**
 * Master/detail over capability-checked private reads. Request generations
 * prevent stale profiles from replacing the customer's current selection.
 * Every error/restriction clears identifiable state rather than inventing ranks.
 */
export function CustomerLeaderboard() {
  const { locale, t } = useSellerCopy();
  const [limit, setLimit] = useState<20 | 50>(20);
  const [data, setData] = useState<Ranking | null>(null);
  const [profile, setProfile] = useState<ProfileResult | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState(false);
  const [profileError, setProfileError] = useState(false);
  const [expired, setExpired] = useState(false);
  const alive = useRef(true); const listRequest = useRef(0); const detailRequest = useRef(0);
  const detailPanel = useRef<HTMLElement>(null); const origin = useRef<HTMLButtonElement | null>(null);
  const restore = useRef(false);
  const load = useCallback(async () => {
    const request = ++listRequest.current; detailRequest.current += 1;
    setLoading(true); setError(false); setSelected(null); setProfile(null); setProfileError(false); setProfileLoading(false); setData(null);
    try {
      const result = await fetchCustomerLeaderboard(limit);
      if (!alive.current || request !== listRequest.current) return;
      setExpired(result === null); setData(result);
    } catch { if (alive.current && request === listRequest.current) setError(true); }
    finally { if (alive.current && request === listRequest.current) setLoading(false); }
  }, [limit]);
  useEffect(() => {
    alive.current = true; void load();
    return () => { alive.current = false; listRequest.current += 1; detailRequest.current += 1; };
  }, [load]);
  useEffect(() => { if (selected) detailPanel.current?.focus(); }, [selected]);
  useEffect(() => {
    if (selected || !restore.current) return; restore.current = false;
    if (origin.current?.isConnected) origin.current.focus(); else document.getElementById('customer-limit')?.focus();
  }, [selected]);
  const select = async (customerRef: string) => {
    const request = ++detailRequest.current;
    setSelected(customerRef); setProfile(null); setProfileError(false); setProfileLoading(true);
    try {
      const result = await fetchCustomerProfile(customerRef);
      if (!alive.current || request !== detailRequest.current) return;
      if (!result) { setExpired(true); setData(null); setSelected(null); return; }
      if (result.access === 'restricted') { setData({ access: 'restricted' }); setSelected(null); return; }
      setProfile(result);
    } catch { if (alive.current && request === detailRequest.current) setProfileError(true); }
    finally { if (alive.current && request === detailRequest.current) setProfileLoading(false); }
  };
  const close = () => { restore.current = true; detailRequest.current += 1; setSelected(null); setProfile(null); setProfileError(false); setProfileLoading(false); };
  const date = (iso: string) => new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Cairo' }).format(new Date(iso));
  if (expired) return <p role="alert" className="border border-line bg-raised p-6 text-body">{t('Your session has expired.')} <a href={localePath(locale, '/seller')} className="link-line">{t('Sign in again')}</a></p>;
  if (data?.access === 'restricted') return <section className="border border-line bg-raised p-6"><h2 className="font-display text-h3">{t('Owner access required')}</h2><p className="mt-3 text-body text-ink2">{t('Customer insights are available only to the active owner of this house.')}</p></section>;
  const rows = data?.access === 'owner' ? data.customers : [];
  const detail = profile?.access === 'owner' ? profile.profile : null;
  return <div className="space-y-5">
    <section className="border border-line bg-raised p-5"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-small text-accent">{t('Private to the house owner')}</p><h2 className="mt-2 font-display text-h3">{t('Top customers')}</h2><p className="mt-2 text-small text-ink2">{t('All time')}</p></div><div className="flex flex-wrap items-end gap-3"><label className="text-small text-ink2" htmlFor="customer-limit">{t('Show')}<select id="customer-limit" value={limit} disabled={loading} onChange={event => setLimit(Number(event.target.value) as 20 | 50)} className="mt-2 block min-h-touch border border-line bg-ground px-3 text-body text-ink"><option value={20}>{t('Top 20')}</option><option value={50}>{t('Top 50')}</option></select></label><button type="button" className={button} disabled={loading} onClick={() => void load()}>{loading ? t('Refreshing…') : t('Refresh customers')}</button></div></div><p className="mt-4 text-small leading-relaxed text-ink2">{t('Rankings include delivered orders with recorded delivery dates and exclude any recorded return, including closed or declined requests.')}</p><p className="mt-2 text-small text-ink2">{t('Names come from customer profiles and are not verified identity.')}</p></section>
    {error && <div role="alert" className="border border-danger bg-raised p-5"><p className="text-body text-ink">{t('Unable to load customers. Check your connection and try again.')}</p><button type="button" onClick={() => void load()} className={`${button} mt-3`}>{t('Try again')}</button></div>}
    {loading ? <p role="status" className="border border-line bg-raised p-6 text-body text-ink2">{t('Loading customers…')}</p> : !error && <section className="min-w-0 overflow-x-auto border border-line bg-raised"><table className="w-full text-start"><caption className="sr-only">{t('Top customers')}</caption><thead><tr className="border-b border-line text-small text-ink2"><th scope="col" className="px-4 py-4 text-start font-medium">{t('Rank')}</th><th scope="col" className="px-4 py-4 text-start font-medium">{t('Customer')}</th><th scope="col" className="px-4 py-4 text-start font-medium">{t('Completed orders')}</th><th scope="col" className="hidden px-4 py-4 text-start font-medium lg:table-cell">{t('Latest delivery')}</th><th scope="col" className="px-4 py-4 text-start font-medium"><span className="sr-only">{t('View profile')}</span></th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.customerRef} className="border-b border-line"><td className="tnum px-4 py-4 align-top text-body text-ink2">{num(index + 1)}</td><th scope="row" className="px-4 py-4 text-start font-normal"><span className="block break-words text-body text-ink">{row.fullName || t('Customer name not provided')}</span><span className="mt-1 block text-small text-ink2 lg:hidden">{date(row.lastDeliveredAt)}</span></th><td className="tnum px-4 py-4 text-body">{num(row.completedOrders)}</td><td className="hidden px-4 py-4 text-small text-ink2 lg:table-cell"><time dateTime={row.lastDeliveredAt}>{date(row.lastDeliveredAt)}</time></td><td className="px-4 py-4"><button type="button" className={button} disabled={profileLoading && selected === row.customerRef} aria-expanded={selected === row.customerRef} aria-controls="customer-profile" onClick={event => { origin.current = event.currentTarget; void select(row.customerRef); }}>{t('View profile')}</button></td></tr>)}</tbody></table>{rows.length === 0 && <p className="p-8 text-body text-ink2">{t('No completed customer purchases yet.')}</p>}</section>}
    {selected && <section id="customer-profile" ref={detailPanel} tabIndex={-1} aria-labelledby="customer-profile-heading" aria-busy={profileLoading} className="border border-line bg-raised p-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="customer-profile-heading" className="font-display text-h3">{t('Customer profile')}</h2><button type="button" className={button} onClick={close}>{t('Close profile')}</button></div>{profileLoading && <p role="status" className="py-6 text-small text-ink2">{t('Loading profile…')}</p>}{profileError && <div role="alert" className="mt-5"><p className="text-small text-danger">{t('Unable to load this customer profile. Try again.')}</p><button type="button" className={`${button} mt-3`} onClick={() => void select(selected)}>{t('Try again')}</button></div>}{!profileLoading && !profileError && !detail && <p className="py-6 text-small text-ink2">{t('This customer profile is unavailable.')}</p>}{detail && <div className="mt-5"><h3 className="break-words font-display text-h3">{detail.fullName || t('Customer name not provided')}</h3><p className="mt-2 text-small text-ink2">{t('Your house only')}</p><dl className="mt-5 grid gap-4 sm:grid-cols-3"><div><dt className="text-small text-ink2">{t('Completed orders')}</dt><dd className="tnum mt-2 text-bodyLg">{num(detail.completedOrders)}</dd></div><div><dt className="text-small text-ink2">{t('First delivery')}</dt><dd className="mt-2 text-body"><time dateTime={detail.firstDeliveredAt}>{date(detail.firstDeliveredAt)}</time></dd></div><div><dt className="text-small text-ink2">{t('Latest delivery')}</dt><dd className="mt-2 text-body"><time dateTime={detail.lastDeliveredAt}>{date(detail.lastDeliveredAt)}</time></dd></div></dl><h4 className="mt-6 border-t border-line pt-5 font-display text-h4">{t('Completed purchase history')}</h4><p className="mt-2 text-small text-ink2">{t('Last 50 completed orders')}</p><ul className="mt-4 divide-y divide-line">{detail.orders.map(order => <li key={order.reference} className="flex flex-wrap items-center justify-between gap-3 py-4"><span><span className="sr-only">{t('Order reference')}: </span><span className="latin break-all text-body" dir="ltr">{order.reference}</span></span><span className="text-small text-ink2">{t('Delivered')} · <time dateTime={order.deliveredAt}>{date(order.deliveredAt)}</time></span></li>)}</ul></div>}</section>}
    <p className="text-small leading-relaxed text-ink2">{t('No contact details or other-house activity are shown. Public recognition requires separate customer permission.')}</p>
  </div>;
}
