import type { Metadata } from 'next';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { PageHead } from '@/features/shell/PageHead';
import { ApplyForm } from '@/features/apply/ApplyForm';
import { APPLY, SHELL } from '@diyar/i18n';
import { getLocale } from '@/core/locale';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: `${APPLY[locale].title} | ${SHELL[locale].titleSuffix}`,
    description: APPLY[locale].metaDescription,
    // Indexable, and one of the few pages here that should be: a maker looking
    // for somewhere to sell types this into a search engine, and a joining page
    // nobody can find recruits nobody.
    robots: { index: true, follow: true },
  };
}

export const dynamic = 'force-dynamic';

export default async function ApplyPage() {
  const copy = APPLY[await getLocale()];
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-phoneMax pb-9 lg:max-w-[720px] lg:px-8 lg:pb-[104px]">
        <PageHead kicker={copy.kicker} title={copy.title} className="mx-5 mb-6 lg:mx-0 lg:mb-8">
          <p className="mt-4 max-w-proseMax text-body leading-relaxed text-ink2 lg:text-bodyLg">{copy.intro}</p>
        </PageHead>

        <div className="mb-8 max-w-proseMax px-5 lg:px-0">

          {/*
            The terms, before the form rather than after it. A page that asks a
            maker for their details and only then explains what joining costs
            them is a page that collected the details under false pretences.
          */}
          <ul className="border border-ink bg-raised px-4">
            <li className="border-b border-line py-3 text-body leading-relaxed text-ink2 last:border-b-0">
              {copy.termFees}
            </li>
            <li className="border-b border-line py-3 text-body leading-relaxed text-ink2 last:border-b-0">
              {copy.termReview}
            </li>
            <li className="border-b border-line py-3 text-body leading-relaxed text-ink2 last:border-b-0">
              {copy.termNoCopies}
            </li>
            <li className="border-b border-line py-3 text-body leading-relaxed text-ink2 last:border-b-0">
              {copy.termReviews}
            </li>
          </ul>
        </div>

        <ApplyForm />
      </main>
      <SiteFooter />
    </>
  );
}
