'use client';

/**
 * Pattern — presentation model: filters and counters derive from the same
 * seller-scoped payload. No synthetic reservations, photos, or stock forecasts.
 * Creation uses progressive disclosure; the server owns all publish decisions.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ListingState, ModerationReason } from '@diyar/domain';
import { Icon } from '@diyar/ui';
import {
  formatPrice, CURRENCY_LABEL, data as num, LISTING_STATE_AR, MODERATION_REASON_AR,
} from '@diyar/i18n';
import { PrimaryButton } from '@/features/shell/PrimaryButton';
import { statusPill } from '@/features/shell/status-pill';
import { createListing } from './listing-actions';
import { filterListings, type ListingFilter } from './listing-filter';

export interface ListingRow {
  id: string;
  name: string;
  slug: string;
  sku: string;
  primaryPhoto: { url: string; alt: string; width: number | null; height: number | null } | null;
  priceRecorded: boolean;
  stockRecorded: boolean;
  state: ListingState;
  pricePiastres: number;
  stock: number;
  moderationReason: ModerationReason | null;
}

const control = 'min-h-touch w-full border border-line bg-ground px-3 py-2 text-body text-ink transition-colors duration-base ease-out focus:border-ink focus:outline-none';
const FILTERS: readonly { value: ListingFilter; label: string }[] = [
  { value: 'all', label: 'جميع الحالات' },
  { value: 'published', label: LISTING_STATE_AR.published },
  { value: 'draft', label: LISTING_STATE_AR.draft },
  { value: 'pending_moderation', label: LISTING_STATE_AR.pending_moderation },
  { value: 'suspended', label: LISTING_STATE_AR.suspended },
  { value: 'archived', label: LISTING_STATE_AR.archived },
  { value: 'needs_changes', label: 'أُعيد للتعديل' },
  { value: 'out_of_stock', label: 'منشور ونفد مخزونه' },
];

export function ListingList({ listings, brandId }: {
  listings: ListingRow[];
  brandId: string | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ListingFilter>('all');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [sku, setSku] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const visible = filterListings(listings, query, filter);
  const stats = [
    { label: 'إجمالي المنتجات', value: listings.length, filter: 'all' as const },
    { label: 'منشور في المتجر', value: listings.filter((l) => l.state === 'published').length, filter: 'published' as const },
    { label: 'في انتظار المراجعة', value: listings.filter((l) => l.state === 'pending_moderation').length, filter: 'pending_moderation' as const },
    { label: 'منشور ونفد مخزونه', value: listings.filter((l) => l.state === 'published' && l.stockRecorded && l.stock === 0).length, filter: 'out_of_stock' as const },
  ];

  const create = () => startTransition(async () => {
    if (!brandId) { setError('لا توجد دار مرتبطة بحسابك. تواصل مع فريق المنصة لإكمال الربط.'); return; }
    setError(null);
    try {
      const result = await createListing({ name: name.trim(), slug: slug.trim(), sku: sku.trim(), brandId });
      if (!result.ok || !result.id) { setError(result.message ?? 'تعذّر الإنشاء. حاول مرة أخرى.'); return; }
      router.push(`/seller/listings/${result.id}`);
    } catch {
      setError('تعذّر الاتصال. تحقّق من اتصالك وحاول مرة أخرى.');
    }
  });

  return (
    <div className="space-y-7">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {stats.map((stat) => (
          <button key={stat.filter} type="button" onClick={() => { setFilter(stat.filter); setQuery(''); }}
            aria-pressed={filter === stat.filter}
            className={`tappable min-h-touch border bg-ground p-4 text-start transition-colors hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${filter === stat.filter ? 'border-accent' : 'border-line'}`}>
            <span className="block text-small text-ink2">{stat.label}</span>
            <span className="tnum mt-3 block text-h3 text-ink">{num(stat.value)}</span>
          </button>
        ))}
      </div>

      <details className="group border border-line bg-ground" open={listings.length === 0 ? true : undefined}>
        <summary className="tappable flex min-h-touch cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-bodyLg text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          <span className="flex items-center gap-3"><Icon.Plus className="h-5 w-5" aria-hidden="true" />إضافة منتج جديد</span>
          <span className="text-small text-ink3">إنشاء مسودة</span>
        </summary>
        <form className="border-t border-line p-5" aria-label="إنشاء منتج جديد" aria-busy={pending}
          onSubmit={(event) => { event.preventDefault(); create(); }}>
          <p className="mb-5 text-small leading-relaxed text-ink2">ابدأ بالاسم والرابط ورمز المنتج، ثم أكمل السعر والصور والمواصفات. لن يظهر المنتج للعملاء قبل المراجعة والموافقة.</p>
          {!brandId && <p role="status" className="mb-5 border-s-2 border-accent ps-3 text-small text-ink2">لا توجد دار مرتبطة بحسابك بعد. تواصل مع فريق المنصة لإكمال الربط قبل إضافة المنتجات.</p>}
          <fieldset disabled={pending || !brandId} className="grid gap-4 disabled:opacity-disabled md:grid-cols-3">
            <div>
              <label htmlFor="n-name" className="mb-2 block text-small text-ink2">اسم العطر</label>
              <input id="n-name" required value={name} maxLength={160} onChange={(e) => setName(e.target.value)} className={control} />
            </div>
            <div>
              <label htmlFor="n-slug" className="mb-2 block text-small text-ink2">رابط المنتج</label>
              <input id="n-slug" required value={slug} maxLength={120} dir="ltr" pattern="[a-z0-9]+(-[a-z0-9]+)*" aria-describedby="n-slug-hint"
                onChange={(e) => setSlug(e.target.value)} className={`${control} latin text-start`} />
              <p id="n-slug-hint" className="mt-2 text-caption leading-relaxed text-ink3">حروف لاتينية صغيرة وأرقام وشرطات، مثل layl-al-qahira. الرابط دائم ولا يتغيّر لاحقًا.</p>
            </div>
            <div>
              <label htmlFor="n-sku" className="mb-2 block text-small text-ink2">رمز المنتج الداخلي · SKU</label>
              <input id="n-sku" required value={sku} maxLength={60} dir="ltr" onChange={(e) => setSku(e.target.value)} className={`${control} latin text-start`} />
            </div>
          </fieldset>
          {error && <p role="alert" className="mt-4 text-small text-danger">{error}</p>}
          <div className="mt-5"><PrimaryButton type="submit" fill="auto" disabled={pending || !brandId || !name.trim() || !slug.trim() || !sku.trim()}>
            {pending ? 'جارٍ إنشاء المسودة…' : 'إنشاء مسودة المنتج'}
          </PrimaryButton></div>
        </form>
      </details>

      <section aria-labelledby="catalogue-heading" className="border border-line bg-ground">
        <div className="border-b border-line p-5">
          <h2 id="catalogue-heading" className="font-display text-h4 text-ink">كتالوج الدار</h2>
          <p className="mt-2 text-small leading-relaxed text-ink2">راجع حالة النشر والسعر والمخزون المسجّل، وافتح المنتج لتعديل بياناته.</p>
          <div className="mt-5 grid gap-3 md:grid-cols-[1fr_15rem]">
            <div>
              <label htmlFor="listing-search" className="mb-2 block text-small text-ink2">البحث بالاسم أو رمز المنتج أو الرابط</label>
              <div className="relative">
                <Icon.Search aria-hidden="true" className="pointer-events-none absolute start-3 top-3 h-5 w-5 text-ink3" />
                <input id="listing-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} className={`${control} ps-10`} />
              </div>
            </div>
            <div>
              <label htmlFor="listing-state" className="mb-2 block text-small text-ink2">حالة المنتج</label>
              <select id="listing-state" value={filter} onChange={(e) => setFilter(e.target.value as ListingFilter)} className={control}>
                {FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
          </div>
          <p role="status" className="mt-3 text-small text-ink3">النتائج: <span className="tnum">{num(visible.length)}</span> / <span className="tnum">{num(listings.length)}</span></p>
        </div>
        {visible.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Icon.Bag aria-hidden="true" className="mx-auto mb-4 h-8 w-8 text-ink3" />
            <h3 className="font-display text-h4 text-ink">{listings.length === 0 ? 'ابدأ بأول عطر في دارك' : 'لا توجد منتجات تطابق البحث'}</h3>
            <p className="mt-3 text-small text-ink2">{listings.length === 0 ? 'أنشئ مسودة من القسم أعلاه، ثم أضف الصور والتفاصيل لإرسالها للمراجعة.' : 'جرّب اسمًا آخر أو اعرض جميع الحالات.'}</p>
            {listings.length > 0 && <button type="button" onClick={() => { setQuery(''); setFilter('all'); }} className="tappable mt-5 min-h-touch px-5 text-small text-accent underline underline-offset-4">مسح البحث والتصفية</button>}
          </div>
        ) : (
          <>
            <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_9rem_8rem_7rem] gap-5 border-b border-line bg-sunken px-5 py-3 text-small text-ink3 lg:grid">
              <span>المنتج</span><span>حالة النشر</span><span>السعر</span><span>المخزون المسجّل</span>
            </div>
            <ul className="divide-y divide-line">
              {visible.map((listing) => (
                <li key={listing.id}>
                  <a href={`/seller/listings/${listing.id}`} className="tappable grid gap-4 px-5 py-5 transition-colors hover:bg-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent lg:grid-cols-[minmax(0,1fr)_9rem_8rem_7rem] lg:items-center lg:gap-5">
                    <div className="flex min-w-0 items-center gap-3">
                      {listing.primaryPhoto ? (
                        <img src={listing.primaryPhoto.url} alt={listing.primaryPhoto.alt} width={64} height={80} loading="lazy"
                          className="h-20 w-16 shrink-0 border border-line bg-sunken object-contain" />
                      ) : (
                        <span className="flex h-20 w-16 shrink-0 items-center justify-center border border-line bg-sunken text-ink3">
                          <Icon.Bag className="h-6 w-6" aria-hidden="true" /><span className="sr-only">لا توجد صورة رئيسية موثقة</span>
                        </span>
                      )}
                      <div className="min-w-0">
                      <span className="block break-words font-display text-bodyLg text-ink">{listing.name || 'بلا اسم'}</span>
                      <span className="latin mt-1 block break-all text-caption text-ink3" dir="ltr">{listing.sku || '—'}</span>
                      <span className="latin mt-1 block break-all text-caption text-ink3" dir="ltr">/p/{listing.slug}</span>
                      {listing.moderationReason && <span className="mt-2 block text-small leading-relaxed text-danger">{listing.state === 'draft' ? 'أُعيد للتعديل: ' : 'سبب المراجعة: '}{MODERATION_REASON_AR[listing.moderationReason]}</span>}
                      </div>
                    </div>
                    <div><span className={statusPill(listing.state === 'suspended' ? 'danger' : listing.state === 'published' ? 'accent' : 'quiet')}>{LISTING_STATE_AR[listing.state]}</span></div>
                    <div className="text-small text-ink2"><span className="me-2 text-ink3 lg:hidden">السعر</span>{listing.priceRecorded ? <><span className="tnum">{formatPrice(listing.pricePiastres)}</span><span className="latin ms-1 text-caption">{CURRENCY_LABEL}</span></> : <span>لم يُحدّد</span>}</div>
                    <div className={`text-small ${listing.stockRecorded && listing.stock === 0 && listing.state === 'published' ? 'text-danger' : 'text-ink2'}`}>
                      <span className="me-2 text-ink3 lg:hidden">المخزون المسجّل</span>{listing.stockRecorded ? <><span className="tnum">{num(listing.stock)}</span>{listing.stock === 0 && <span className="ms-2 text-caption">نفد</span>}</> : <span>لم يُحدّد</span>}
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
