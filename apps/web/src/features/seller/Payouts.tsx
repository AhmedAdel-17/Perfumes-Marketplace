'use client';
import { localePath } from '@diyar/i18n';
import { useSellerCopy } from '@/features/seller/use-seller-copy';


import { useCallback, useEffect, useRef, useState } from 'react';
import { CURRENCY_LABEL, formatPrice, internal as num, ORDER_SOURCE_AR } from '@diyar/i18n';
import { Icon } from '@diyar/ui';
import { statusPill } from '@/features/shell/status-pill';
import { fetchPayouts, fetchStatement } from './actions';
import { statementCsv, summarisePayouts } from './payout-model';

type Payouts = NonNullable<Awaited<ReturnType<typeof fetchPayouts>>>;
type Statement = NonNullable<Awaited<ReturnType<typeof fetchStatement>>>;
const STATES: Record<string, string> = {
  accruing: "Accruing", pending_review: "Pending review", approved: "Approved",
  paid: "Paid", disputed: "Disputed", held: "On hold",
};
const control = 'min-h-touch w-full border border-line bg-ground px-3 py-2 text-body text-ink focus:border-ink focus:outline-none';
const quietButton = 'tappable inline-flex min-h-touch items-center justify-center border border-line px-4 text-small text-ink2 transition-colors hover:border-accent hover:text-accent disabled:opacity-disabled focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

/**
 * Pattern — master/detail view over owner-scoped statement reads. Financial
 * statuses stay literal; totals never imply a transfer was made. Request
 * generations prevent late responses from replacing a newly selected statement.
 */
export function SellerPayouts() {
  const { locale, t } = useSellerCopy();

  const [payouts, setPayouts] = useState<Payouts | null>(null);
  const [open, setOpen] = useState<Statement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const alive = useRef(true);
  const loadRequest = useRef(0);
  const detailRequest = useRef(0);
  const detailPanel = useRef<HTMLElement>(null);
  const originButton = useRef<HTMLButtonElement | null>(null);
  const restoreFocus = useRef(false);

  const load = useCallback(async () => {
    const request = ++loadRequest.current;
    setLoading(true); setError(null);
    try {
      const result = await fetchPayouts();
      if (!alive.current || request !== loadRequest.current) return;
      setExpired(result === null); setPayouts(result);
      if (result === null) { setOpen(null); setSelectedId(null); detailRequest.current += 1; }
    } catch {
      if (alive.current && request === loadRequest.current) setError(t("Could not load statements. Check your connection and try again."));
    } finally {
      if (alive.current && request === loadRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true; void load();
    return () => { alive.current = false; loadRequest.current += 1; detailRequest.current += 1; };
  }, [load]);
  useEffect(() => { if (open) detailPanel.current?.focus(); }, [open]);
  useEffect(() => {
    if (selectedId !== null || !restoreFocus.current) return;
    restoreFocus.current = false;
    // Wait until the panel is removed and its originating row is enabled again.
    if (originButton.current?.isConnected) originButton.current.focus();
    else document.getElementById('payout-search')?.focus();
  }, [selectedId]);

  const select = async (id: string) => {
    const request = ++detailRequest.current;
    setSelectedId(id); setOpen(null); setLoadingId(id); setDetailError(null);
    try {
      const result = await fetchStatement(id);
      if (!alive.current || request !== detailRequest.current) return;
      if (!result) setDetailError(t("Statement unavailable or session expired. Refresh statements or sign in again."));
      else setOpen(result);
    } catch {
      if (alive.current && request === detailRequest.current) setDetailError(t("Could not load statement details. Try again."));
    } finally {
      if (alive.current && request === detailRequest.current) setLoadingId(null);
    }
  };
  const close = () => { restoreFocus.current = selectedId !== null; detailRequest.current += 1; setSelectedId(null); setOpen(null); setLoadingId(null); setDetailError(null); };

  if (expired) return <p role="alert" className="border border-line bg-ground p-6 text-body">{t("Your session has expired. ")}<a href={localePath(locale,"/seller")} className="link-line">{t("Sign in again")}</a></p>;
  if (payouts === null) return <div className="border border-line bg-ground p-6" aria-busy={loading}>
    <p role={error ? 'alert' : 'status'} className="text-small text-ink2">{error ?? t("Loading financial statements…")}</p>
    {error && <button type="button" onClick={() => void load()} disabled={loading} className={`${quietButton} mt-4`}>{t("Try again")}</button>}
  </div>;

  const summary = summarisePayouts(payouts);
  const search = query.trim().toLocaleLowerCase('ar');
  const visible = payouts.filter((payout) => (filter === 'all' || payout.status === filter)
    && (!search || payout.reference.toLocaleLowerCase('ar').includes(search)));
  const selected = payouts.find((payout) => payout.id === selectedId);
  const showDetail = selectedId !== null;

  return <div className="space-y-6">
    <div className="grid gap-3 md:grid-cols-3">
      <Metric label={t("Paid statement net")} value={<Money value={summary.paidPiastres} />} />
      <Metric label={t("Unpaid statement net")} value={<Money value={summary.unpaidPiastres} />} />
      <Metric label={t("Statements")} value={<span className="tnum">{num(summary.count)}</span>} />
    </div>
    <p className="text-small leading-relaxed text-ink2">{t("Figures cover statements accessible to your account. Unpaid includes accruing, pending, held and disputed statements; it does not mean funds are available for transfer.")}</p>
    {error && <p role="alert" className="border-s-2 border-danger ps-3 text-small text-danger">{error}</p>}
    <div className={`grid items-start gap-5 ${showDetail ? 'xl:grid-cols-2' : ''}`}>
      <section aria-labelledby="payouts-heading" className="min-w-0 border border-line bg-ground">
        <div className="border-b border-line p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="payouts-heading" className="font-display text-h4">{t("Statements & transfers")}</h2>
            <button type="button" onClick={() => { close(); void load(); }} disabled={loading} className={quietButton}>{loading ? t("Refreshing…") : t("Refresh statements")}</button>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div><label htmlFor="payout-search" className="mb-2 block text-small text-ink2">{t("Search statement reference")}</label><input id="payout-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} className={control} /></div>
            <div><label htmlFor="payout-state" className="mb-2 block text-small text-ink2">{t("Statement status")}</label><select id="payout-state" value={filter} onChange={(e) => setFilter(e.target.value)} className={control}>
              <option value="all">{t("All statuses")}</option>{Array.from(new Set(payouts.map((payout) => payout.status))).map((state) => <option key={state} value={state}>{t(STATES[state] ?? state)}</option>)}
            </select></div>
          </div>
          <p role="status" className="mt-3 text-caption text-ink3">{t("Results: ")}<span className="tnum">{num(visible.length)}</span> / <span className="tnum">{num(payouts.length)}</span></p>
        </div>
        {visible.length === 0 ? <div className="p-8 text-center">
          <Icon.Bag aria-hidden="true" className="mx-auto mb-3 h-8 w-8 text-ink3" />
          <h3 className="font-display text-h4">{payouts.length === 0 ? t("No financial statements yet") : t("No matching statements")}</h3>
          <p className="mt-3 text-small leading-relaxed text-ink2">{payouts.length === 0 ? t("Your first statement will show orders, commissions and payment status here. Financial statements are restricted to the house owner.") : t("Try another reference or show all statuses.")}</p>
          {payouts.length > 0 && <button type="button" className={`${quietButton} mt-4`} onClick={() => { setQuery(''); setFilter('all'); }}>{t("Clear filters")}</button>}
        </div> : <ul className="divide-y divide-line">
          {visible.map((payout) => <li key={payout.id}>
            <button type="button" disabled={loadingId === payout.id} onClick={(event) => { originButton.current = event.currentTarget; void select(payout.id); }} aria-expanded={selectedId === payout.id} aria-controls="statement-panel"
              className={`tappable block min-h-touch w-full border-s-2 p-5 text-start transition-colors hover:bg-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${selectedId === payout.id ? 'border-accent bg-sunken' : 'border-transparent'}`}>
              <div className="flex flex-wrap items-center justify-between gap-3"><span className="latin break-all text-small text-ink">{payout.reference}</span><Status value={payout.status} /></div>
              <p className="mt-3 text-caption leading-relaxed text-ink3"><Period start={payout.periodStart} end={payout.periodEnd} /></p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><span className="text-small text-ink2">{t("Statement net")}</span><span className="text-bodyLg text-ink"><Money value={payout.netPiastres} /></span></div>
              <p className="mt-3 text-caption text-ink3">{loadingId === payout.id ? t("Loading details…") : payout.paidAt ? <>{t("Recorded payment date: ")}<DateText iso={payout.paidAt} /></> : t("No payment date recorded")}</p>
            </button>
          </li>)}
        </ul>}
      </section>
      {showDetail && <section ref={detailPanel} id="statement-panel" tabIndex={-1} aria-labelledby="statement-heading" aria-busy={loadingId !== null} className="min-w-0 border border-line bg-ground p-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent lg:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 id="statement-heading" className="font-display text-h4">{t("Statement details")}</h2><button type="button" onClick={close} className={quietButton}>{t("Close details")}</button></div>
        {loadingId && <p role="status" className="text-small text-ink2">{t("Loading statement details…")}</p>}
        {detailError && <div role="alert"><p className="text-small text-danger">{detailError}</p><button type="button" className={`${quietButton} mt-4`} onClick={() => { if (selectedId) void select(selectedId); }}>{t("Try again")}</button></div>}
        {open && <StatementView statement={open} paidAt={selected?.paidAt ?? null} />}
      </section>}
    </div>
  </div>;
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {

  return <div className="border border-line bg-ground p-5"><p className="text-small text-ink2">{label}</p><div className="mt-4 text-h3 text-ink">{value}</div></div>;
}
function Money({ value }: { value: number }) {

  return <><span className="tnum">{formatPrice(value)}</span><span className="latin ms-2 text-caption text-ink3">{CURRENCY_LABEL}</span></>;
}
function Status({ value }: { value: string }) {
  const { t } = useSellerCopy();

  return <span className={statusPill(value === 'paid' ? 'accent' : value === 'disputed' ? 'danger' : 'quiet')}>{t(STATES[value] ?? value)}</span>;
}
function StatementView({ statement, paidAt }: { statement: Statement; paidAt: string | null }) {
  const { locale, t } = useSellerCopy();

  const [exportError, setExportError] = useState<string | null>(null);
  const download = () => {
    setExportError(null);
    try {
      const blob = new Blob([statementCsv(statement.reference, statement.lines, locale)], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url;
      link.download = `diyar-${statement.reference.replace(/[^A-Za-z0-9_-]/g, '_')}.csv`;
      document.body.appendChild(link);
      try { link.click(); }
      finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
    } catch { setExportError(t("Could not download the file. Try again.")); }
  };
  return <div>
    <div className="flex flex-wrap items-center justify-between gap-3"><span className="latin break-all text-small text-ink">{statement.reference}</span><Status value={statement.status} /></div>
    <p className="mt-3 text-caption leading-relaxed text-ink3"><Period start={statement.periodStart} end={statement.periodEnd} /></p>
    {paidAt && <p className="mt-2 text-small text-ink2">{t("Recorded payment date: ")}<DateText iso={paidAt} /></p>}
    <dl className="mt-6 border-y border-line py-4">
      <Row label={t("Gross merchandise")} piastres={statement.grossPiastres} />
      <Row label={t("Platform commission")} piastres={-statement.commissionPiastres} />
      <Row label={t("Shipping reimbursement (added)")} piastres={statement.shippingPiastres} />
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-4"><dt className="text-bodyLg">{t("Statement net")}</dt><dd className="text-h3"><Money value={statement.netPiastres} /></dd></div>
    </dl>
    <div className="my-5 flex flex-wrap items-center justify-between gap-3"><h3 className="font-display text-bodyLg">{t("Statement lines ")}<span className="tnum text-small text-ink3">({num(statement.lines.length)})</span></h3><button type="button" disabled={statement.lines.length === 0} onClick={download} className={quietButton}>{t("Download lines CSV")}</button></div>
    <p className="mb-4 text-caption leading-relaxed text-ink3">{t("CSV amounts are in Egyptian piastres to avoid number-format ambiguity.")}</p>
    {exportError && <p role="alert" className="mb-4 text-small text-danger">{exportError}</p>}
    {statement.lines.length === 0 && <p className="border border-line p-4 text-small text-ink2">{t("No lines recorded in this statement.")}</p>}
    <ul className="space-y-3">{statement.lines.map((line, index) => <li key={`${line.subOrderReference}-${index}`} className="border border-line p-4">
      <p className="latin break-all text-small text-ink">{line.subOrderReference}</p>
      <p className="mt-2 text-caption leading-relaxed text-ink3">{t("Commission source: ")}{t(ORDER_SOURCE_AR[line.commissionSource as keyof typeof ORDER_SOURCE_AR] ?? line.commissionSource)} · <span className="tnum">{num(line.commissionBps / 100)}</span>%</p>
      <dl className="mt-3"><Row label={t("Merchandise")} piastres={line.grossPiastres} /><Row label={t("Commission")} piastres={-line.commissionPiastres} /><Row label={t("Shipping reimbursement (added)")} piastres={line.shippingPiastres} /><div className="mt-2 border-t border-line pt-2"><Row label={t("Net")} piastres={line.netPiastres} /></div></dl>
    </li>)}</ul>
    <p className="mt-5 border-s-2 border-accent ps-3 text-small leading-relaxed text-ink2">{statement.disputeDeadline ? <>{t("Recorded dispute deadline: ")}<DateText iso={statement.disputeDeadline} />{t(". To dispute, contact the platform team with the statement reference.")}</> : t("No dispute deadline is recorded. Contact the platform team with the statement reference for help.")}</p>
  </div>;
}
function Row({ label, piastres }: { label: string; piastres: number }) {

  return <div className="flex flex-wrap justify-between gap-2 py-1.5 text-small text-ink2"><dt>{label}</dt><dd><Money value={piastres} /></dd></div>;
}

function DateText({ iso }: { iso: string }) {
  const { locale } = useSellerCopy();
 return <time dateTime={iso} className="tnum">{new Intl.DateTimeFormat(locale==='en'?'en-GB':'ar-EG-u-ca-gregory',{day:'numeric',month:'long',year:'numeric',timeZone:'Africa/Cairo'}).format(new Date(iso))}</time>; }
function Period({ start, end }: { start: string; end: string }) {
 return <><DateText iso={start} /> — <DateText iso={end} /></>; }
