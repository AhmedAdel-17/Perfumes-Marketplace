import type { Metadata } from 'next';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { PageHead } from '@/features/shell/PageHead';
import { SupportForm, TicketLookup } from '@/features/support/SupportForm';
import { CONTACT, SHELL } from '@diyar/i18n';
import { getLocale } from '@/core/locale';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: `${CONTACT[locale].title} | ${SHELL[locale].titleSuffix}`,
    description: CONTACT[locale].metaDescription,
    // Indexable, unlike the tracking page. "How do I contact them" is a
    // question people type into a search engine before they buy, and a contact
    // page nobody can find is the same as not having one.
    robots: { index: true, follow: true },
  };
}

export const dynamic = 'force-dynamic';

export default async function SupportPage() {
  const copy = CONTACT[await getLocale()];
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-phoneMax pb-9 lg:max-w-[720px] lg:px-8 lg:pb-[104px]">
        <PageHead kicker={copy.kicker} title={copy.title} className="mx-5 mb-6 lg:mx-0 lg:mb-8">
          <p className="mt-4 max-w-proseMax text-body leading-relaxed text-ink2 lg:text-bodyLg">{copy.intro}</p>
        </PageHead>

        <SupportForm />

        <section className="mt-[72px] border-t border-ink pt-8">
          <h2 className="px-5 pb-5 font-display text-h3 lg:px-0 lg:text-h2Lg">
            {copy.followUp}
          </h2>
          <TicketLookup />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
