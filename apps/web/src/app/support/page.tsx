import type { Metadata } from 'next';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { SupportForm, TicketLookup } from '@/features/support/SupportForm';

export const metadata: Metadata = {
  title: 'تواصل معنا | ديار',
  description: 'اسأل عن طلبك أو عن عطر قبل أن تشتريه.',
  // Indexable, unlike the tracking page. "How do I contact them" is a question
  // people type into a search engine before they buy, and a contact page nobody
  // can find is the same as not having one.
  robots: { index: true, follow: true },
};

export const dynamic = 'force-dynamic';

export default function SupportPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-phoneMax pb-9 lg:max-w-[720px] lg:px-8 lg:pb-[88px]">
        <h1 className="px-5 pb-3 pt-7 font-display text-h1 leading-heading lg:px-0 lg:pb-4 lg:pt-9 lg:text-h1Lg">
          تواصل معنا
        </h1>

        <p className="mb-8 max-w-proseMax px-5 text-small leading-relaxed text-ink2 lg:px-0 lg:text-bodyLg">
          اكتب لنا عن طلبك، أو اسأل عن عطر قبل أن تشتريه. نردّ خلال يوم عمل.
        </p>

        <SupportForm />

        <section className="mt-[72px] border-t border-line pt-8">
          <h2 className="px-5 pb-5 font-display text-h3 lg:px-0 lg:text-h2Lg">
            تابع رسالة سابقة
          </h2>
          <TicketLookup />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
