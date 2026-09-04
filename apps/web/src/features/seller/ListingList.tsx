'use client';

/**
 * A house's own listings, and the one control that starts a new one.
 *
 * Name, path and code are set HERE and never again. A product URL is forever —
 * it is shared, saved, and indexed — so an interface offering to change one
 * later would be offering to break every link anyone ever sent.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ListingState, ModerationReason } from '@diyar/domain';
import { formatPrice, CURRENCY_LABEL, data as num } from '@diyar/i18n';
import { PrimaryButton } from '@/features/shell/PrimaryButton';
import { createListing } from './listing-actions';

const STATE_LABELS: Record<ListingState, string> = {
  draft: 'مسودة',
  pending_moderation: 'قيد المراجعة',
  published: 'منشور',
  suspended: 'موقوف',
  archived: 'مؤرشف',
};

const REASON_LABELS: Record<ModerationReason, string> = {
  prohibited_claim: 'ادّعاء ممنوع',
  missing_required_fields: 'بيانات ناقصة',
  unsupported_claim: 'ادّعاء بلا دليل',
  misleading_media: 'صور مضلّلة',
  implausible_pricing: 'سعر غير منطقي',
  duplicate_listing: 'منتج مكرّر',
  restricted_ingredient: 'مكوّن مقيّد',
};

export interface ListingRow {
  id: string;
  name: string;
  slug: string;
  state: ListingState;
  pricePiastres: number;
  stock: number;
  moderationReason: ModerationReason | null;
}

const control = 'h-control w-full rounded-sm border border-hair bg-noir px-3 text-body text-bone transition-colors duration-base ease-out focus:border-dim focus:outline-none focus-visible:border-brass';

export function ListingList({ listings, brandId }: {
  listings: ListingRow[];
  /** The house's brand. Null when it has none yet, which blocks creation. */
  brandId: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [sku, setSku] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const create = () => startTransition(async () => {
    if (!brandId) { setError('لا توجد دار مرتبطة بحسابك.'); return; }
    const result = await createListing({
      name: name.trim(), slug: slug.trim(), sku: sku.trim(), brandId,
    });
    if (!result.ok) { setError(result.message ?? 'تعذّر الإنشاء.'); return; }
    setError(null);
    router.push(`/seller/listings/${result.id}`);
  });

  return (
    <div className="px-5 lg:px-0">
      {listings.length === 0 ? (
        <p className="py-8 text-bodyLg text-dim">لم تضف منتجات بعد.</p>
      ) : (
        <ul className="border-t border-hair">
          {listings.map((listing) => (
            <li key={listing.id} className="border-b border-hair">
              <a
                href={`/seller/listings/${listing.id}`}
                className="tappable flex min-h-touch flex-wrap items-center justify-between gap-3 py-4 transition-colors duration-base ease-out hover:text-brass"
              >
                <span>
                  <span className="font-display text-bodyLg text-bone">
                    {listing.name || 'بلا اسم'}
                  </span>
                  {/*
                    A returned listing says WHY on the list, not one click in.
                    A house scanning ten products should see which one needs
                    them without opening each.
                  */}
                  {listing.moderationReason && (
                    <span className="ms-3 text-caption text-danger">
                      {REASON_LABELS[listing.moderationReason]}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-4">
                  <span className="text-caption text-faint">
                    <span className="tnum">{num(listing.stock)}</span> في المخزون
                  </span>
                  <span className="text-small text-dim">
                    <span className="tnum">{formatPrice(listing.pricePiastres)}</span>
                    <span className="latin ms-1 text-micro tracking-label">{CURRENCY_LABEL}</span>
                  </span>
                  <span className="text-caption text-faint">{STATE_LABELS[listing.state]}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-10 pt-7">
        <h2 className="mb-4 font-display text-h4">منتج جديد</h2>

        <div className="mb-3">
          <label htmlFor="n-name" className="mb-1.5 block text-caption tracking-label text-faint">
            اسم العطر
          </label>
          <input id="n-name" value={name} maxLength={160}
            onChange={(e) => setName(e.target.value)} className={control} />
        </div>

        <div className="mb-3">
          <label htmlFor="n-slug" className="mb-1.5 block text-caption tracking-label text-faint">
            المسار — حروف لاتينية صغيرة وشرطات، ولا يمكن تغييره لاحقًا
          </label>
          <input id="n-slug" value={slug} maxLength={120} dir="ltr"
            onChange={(e) => setSlug(e.target.value)}
            className={`${control} latin text-start`} />
        </div>

        <div className="mb-4">
          <label htmlFor="n-sku" className="mb-1.5 block text-caption tracking-label text-faint">
            رمز المنتج — رمزك الداخلي
          </label>
          <input id="n-sku" value={sku} maxLength={60} dir="ltr"
            onChange={(e) => setSku(e.target.value)}
            className={`${control} latin text-start`} />
        </div>

        {error && <p role="alert" className="mb-4 text-small text-danger">{error}</p>}

        <PrimaryButton
          type="button" fill="auto" onClick={create}
          disabled={pending || !brandId
            || name.trim().length === 0 || slug.trim().length === 0 || sku.trim().length === 0}
        >
          {pending ? '…' : 'إنشاء'}
        </PrimaryButton>
      </section>
    </div>
  );
}
