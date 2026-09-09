import { counted, data as num, REVIEW, VERIFIED_PURCHASE_AR } from '@diyar/i18n';
import { formatRating } from '@diyar/domain';
import { api } from '@/core/api';
import { DimensionBars, OverallScore } from './Ratings';

/**
 * What people who bought it said.
 *
 * The homepage has promised "تقييمات موثّقة بالشراء" since the first version of
 * this site, and until now there was no screen anywhere that could show one.
 * This is that screen's content.
 *
 * A SERVER COMPONENT. Reviews are the part of a product page that persuades,
 * and a section that arrives after hydration is a section the search engine
 * never sees and a customer on a slow connection scrolls past.
 *
 * The empty state is not a zero. A perfume nobody has reviewed rated "٠٫٠ من ٥"
 * has been libelled by its own page.
 */
export async function ProductReviews({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const { summary, reviews } = await api().reviews.forProduct({ productId, limit: 20 });

  return (
    <section id="reviews" className="mt-8 border-t border-line px-5 pt-7 lg:mt-[96px] lg:px-0 lg:pt-9">
      <h2 className="font-display text-h3 lg:text-h2Lg">التقييمات</h2>

      {summary.count === 0 ? (
        <div className="mt-4 max-w-proseMax">
          <p className="text-small leading-relaxed text-ink2 lg:text-bodyLg">
            لم يكتب أحد عن {productName} بعد.
          </p>
          {/*
            The invitation says WHY the section is empty, which is the honest
            reading of it: this shop only accepts reviews from people who
            received the bottle, so an empty section means few buyers rather
            than unhappy ones.
          */}
          <p className="mt-2 text-caption leading-relaxed text-ink3">
            كل تقييم هنا مكتوب بعد استلام الطلب فعلًا — لا نقبل غير ذلك، ولذلك تتأخر
            التقييمات الأولى.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5 lg:grid lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-5">
              <OverallScore summary={summary} />
              <p className="mt-2 text-caption tracking-label text-ink3">
                {counted(summary.count, REVIEW, num)}
                {' · '}
                {VERIFIED_PURCHASE_AR}
              </p>
              <DimensionBars summary={summary} />
            </div>

            <ol className="mt-8 lg:col-span-7 lg:mt-0">
              {reviews.map((review) => (
                <li key={review.id} className="border-t border-line py-5 first:border-t-0 first:pt-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-small text-ink">{review.authorName}</span>
                    <span
                      dir="ltr"
                      className="tnum text-caption text-accent"
                    >
                      {formatRating(
                        (review.ratings.scent + review.ratings.longevity
                          + review.ratings.projection + review.ratings.value
                          + review.ratings.packaging + review.ratings.descriptionAccuracy) / 6,
                      )}
                    </span>
                  </div>

                  {/*
                    The badge on EVERY review, not on some of them.

                    A badge that appears on a subset teaches a reader to check
                    for it, and this table cannot hold an unverified review —
                    it is a structural fact about the schema, so it is stated
                    once per review as a plain fact rather than as a prize.
                  */}
                  <div className="mt-1 text-micro tracking-label text-ink3">
                    {VERIFIED_PURCHASE_AR}
                    {' · '}
                    <time dateTime={review.createdAt}>
                      {new Date(review.createdAt).toLocaleDateString('ar-EG', {
                        year: 'numeric', month: 'long',
                      })}
                    </time>
                  </div>

                  {review.body && (
                    <p className="mt-3 max-w-proseMax text-small leading-relaxed text-ink2">
                      {review.body}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </>
      )}

      <p className="mt-7 text-caption leading-relaxed text-ink3">
        اشتريت هذا العطر؟{' '}
        <a
          href="/order"
          // `inline-flex min-h-touch`: a caption-sized link is a 34px line box,
          // and `tappable` alone lands short of the floor. The label stays small
          // while the TARGET is a target.
          className="tappable inline-flex min-h-touch items-center border-b border-accent/50 text-ink2 transition-colors duration-base ease-out hover:border-accent hover:text-accent"
        >
          افتح صفحة تتبّع الطلب لكتابة تقييمك
        </a>
      </p>
    </section>
  );
}
