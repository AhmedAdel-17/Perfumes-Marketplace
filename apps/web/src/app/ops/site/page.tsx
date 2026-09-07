import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SiteContent } from '@/features/ops/SiteContent';
import { OpsNav } from '@/features/ops/OpsNav';
import { activeOperator } from '@/features/ops/actions';
import { listPublishedProducts } from '@/core/catalogue';
import { api } from '@/core/api';

export const metadata: Metadata = {
  title: 'الموقع | ديار',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function OpsSitePage() {
  const session = await activeOperator();
  if (!session) redirect('/ops');

  const caller = api(
    { role: 'platform', id: session.authUserId },
    null,
    { staffId: session.staffId, role: session.role },
  );

  const [announcements, curation, products] = await Promise.all([
    caller.site.announcements(),
    caller.site.curation(),
    listPublishedProducts(),
  ]);

  /*
    760px was the phone column with margins — a working tool rendered at just
    over half the monitor it is used on, with every row stretched to reach both
    of its edges. The console gets the content measure, and the lists inside it
    get columns so the extra width becomes room rather than distance.
    DESIGN_DOCTRINE §4b.
  */
  return (
    <main className="mx-auto max-w-phoneMax pb-9 lg:max-w-contentMax lg:px-8">
      <header className="flex flex-wrap items-baseline justify-between gap-4 px-5 pb-7 pt-9 lg:px-0">
        <div>
          <div className="latin mb-3 text-micro tracking-label text-accent">OPERATIONS</div>
          <h1 className="font-display text-h1 leading-heading lg:text-h1Lg">الموقع</h1>
          <p className="mt-2 text-caption text-ink3">{session.fullName}</p>
        </div>

        <OpsNav current="site" />
      </header>

      <SiteContent
        announcements={announcements}
        curation={{
          heroProductId: curation.heroProductId,
          featuredProductIds: [...curation.featuredProductIds],
        }}
        products={products.map((p) => ({ id: p.id, name: p.name, brandName: p.brandLatin }))}
      />
    </main>
  );
}
