import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OpsNav } from '@/features/ops/OpsNav';
import { ReviewQueue } from '@/features/ops/ReviewQueue';
import { fetchReviewQueue } from '@/features/ops/review-actions';
import { activeOperator } from '@/features/ops/actions';

export const metadata: Metadata = {
  title: 'التقييمات | ديار',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Every review, newest first — hidden ones included.
 *
 * Not a queue of things awaiting a decision, because reviews do not wait for
 * one: a verified review is published the moment it is written, and moderation
 * is something that happens afterwards, if a complaint arrives. A screen that
 * held reviews back pending approval would be a screen where a house's bad week
 * quietly never reaches the shopfront.
 */
export default async function OpsReviewsPage() {
  const session = await activeOperator();
  if (!session) redirect('/ops');

  const rows = await fetchReviewQueue();

  return (
    <main className="mx-auto max-w-phoneMax pb-9 lg:max-w-contentMax lg:px-8">
      <header className="flex flex-wrap items-baseline justify-between gap-4 px-5 pb-7 pt-9 lg:px-0">
        <div>
          <div className="latin mb-3 text-micro tracking-label text-accent">OPERATIONS</div>
          <h1 className="font-display text-h1 leading-heading lg:text-h1Lg">التقييمات</h1>
          <p className="mt-2 max-w-proseMax text-caption leading-relaxed text-ink3">
            الإخفاء يزيل الإساءة، لا النقد. كل إخفاء يحتاج سببًا مكتوبًا ويُسجَّل
            في سجل المراجعة، ولا شيء هنا يحذف تقييمًا.
          </p>
        </div>

        <OpsNav current="reviews" />
      </header>

      <ReviewQueue rows={rows ?? []} />
    </main>
  );
}
