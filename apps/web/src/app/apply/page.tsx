import type { Metadata } from 'next';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { ApplyForm } from '@/features/apply/ApplyForm';

export const metadata: Metadata = {
  title: 'انضم كدار | ديار',
  description: 'ديار سوق للعطور المصرية المستقلّة. اعرض دارك على من يبحث عنها.',
  // Indexable, and one of the few pages here that should be: a maker looking
  // for somewhere to sell types this into a search engine, and a joining page
  // nobody can find recruits nobody.
  robots: { index: true, follow: true },
};

export const dynamic = 'force-dynamic';

export default function ApplyPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-phoneMax pb-9 lg:max-w-[720px] lg:px-8 lg:pb-[88px]">
        <h1 className="px-5 pb-3 pt-7 font-display text-h1 leading-heading lg:px-0 lg:pb-4 lg:pt-9 lg:text-h1Lg">
          انضم كدار
        </h1>

        <div className="mb-8 max-w-proseMax px-5 lg:px-0">
          <p className="text-small leading-relaxed text-ink2 lg:text-bodyLg">
            ديار سوق للعطور المصرية المستقلّة. الدار تضع اسمها على الزجاجة،
            وتجهّز طلباتها وتشحنها بنفسها، ونحن نعرضها ونحصّل الثمن ونفصل في
            النزاع حين يقع.
          </p>

          {/*
            The terms, before the form rather than after it. A page that asks a
            maker for their details and only then explains what joining costs
            them is a page that collected the details under false pretences.
          */}
          <ul className="mt-5 border-t border-line">
            <li className="border-b border-line py-3 text-caption leading-relaxed text-ink2">
              لا رسوم انضمام ولا اشتراك شهري. عمولة على البيع فقط.
            </li>
            <li className="border-b border-line py-3 text-caption leading-relaxed text-ink2">
              مراجعة من ثمانية بنود قبل البيع: هويّة المسؤول، ملكية حساب التحويل،
              المسؤولية عن المنتج، الملصقات، إثبات ما يُذكر في الوصف، طريق الإرجاع،
              القدرة على التجهيز، ومسؤول الخصوصية.
            </li>
            <li className="border-b border-line py-3 text-caption leading-relaxed text-ink2">
              لا نقبل عطرًا يُقدَّم على أنه تقليد أو نسخة من دار أخرى.
            </li>
            <li className="border-b border-line py-3 text-caption leading-relaxed text-ink2">
              التقييمات من المشترين فقط، ولا يمكن للدار حذف تقييم لأنه سيّئ.
            </li>
          </ul>
        </div>

        <ApplyForm />
      </main>
      <SiteFooter />
    </>
  );
}
