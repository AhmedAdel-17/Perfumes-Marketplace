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
import {
  formatPrice, CURRENCY_LABEL, data as num, LISTING_STATE_AR, MODERATION_REASON_AR,
} from '@diyar/i18n';
import { PrimaryButton } from '@/features/shell/PrimaryButton';
import { createListing } from './listing-actions';

// Declared against the domain's unions, so a state or reason added there
// without a word in i18n fails to compile here rather than rendering blank.
const STATE_LABELS: Record<ListingState, string> = LISTING_STATE_AR;
const REASON_LABELS: Record<ModerationReason, string> = MODERATION_REASON_AR;

export interface ListingRow {
  id: string;
  name: string;
  slug: string;
  state: ListingState;
  pricePiastres: number;
  stock: number;
  moderationReason: ModerationReason | null;
}

const control = 'h-control w-full rounded-sm border border-line bg-ground px-3 text-body text-ink transition-colors duration-base ease-out focus:border-ink2 focus:outline-none focus-visible:border-accent';

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
        <p className="py-8 text-bodyLg text-ink2">لم تضف منتجات بعد.</p>
      ) : (
        <ul className="border-t border-line">
          {listings.map((listing) => (
            <li key={listing.id} className="border-b border-line">
              <a
                href={`/seller/listings/${listing.id}`}
                /* Columns from `lg`. Pushed to the edges of a 1240px console,
                   the stock count sat 450px from the product it counts. */
                className="tappable flex min-h-touch flex-wrap items-center justify-between gap-3 py-4 transition-colors duration-base ease-out hover:text-accent lg:grid lg:grid-cols-[1fr_14ch_12ch_10ch] lg:items-center lg:gap-6"
              >
                <span>
                  <span className="font-display text-bodyLg text-ink">
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
                <>
                  <span className="text-caption text-ink3">
                    <span className="tnum">{num(listing.stock)}</span> في المخزون
                  </span>
                  <span className="text-small text-ink2">
                    <span className="tnum">{formatPrice(listing.pricePiastres)}</span>
                    <span className="latin ms-1 text-micro tracking-label">{CURRENCY_LABEL}</span>
                  </span>
                  <span className="text-caption text-ink3">{STATE_LABELS[listing.state]}</span>
                </>
              </a>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-10 pt-7">
        <h2 className="mb-4 font-display text-h4">منتج جديد</h2>

        <div className="mb-3">
          <label htmlFor="n-name" className="mb-1.5 block text-caption tracking-label text-ink3">
            اسم العطر
          </label>
          <input id="n-name" value={name} maxLength={160}
            onChange={(e) => setName(e.target.value)} className={control} />
        </div>

        <div className="mb-3">
          <label htmlFor="n-slug" className="mb-1.5 block text-caption tracking-label text-ink3">
            المسار — حروف لاتينية صغيرة وشرطات، ولا يمكن تغييره لاحقًا
          </label>
          <input id="n-slug" value={slug} maxLength={120} dir="ltr"
            onChange={(e) => setSlug(e.target.value)}
            className={`${control} latin text-start`} />
        </div>

        <div className="mb-4">
          <label htmlFor="n-sku" className="mb-1.5 block text-caption tracking-label text-ink3">
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
