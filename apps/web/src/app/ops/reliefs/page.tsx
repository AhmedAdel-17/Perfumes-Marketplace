import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { OpsNav } from '@/features/ops/OpsNav';
import { ConsoleHead } from '@/features/shell/ConsoleHead';
import { activeOperator } from '@/features/ops/actions';
import { fetchReliefs } from '@/features/ops/relief-actions';

export const metadata: Metadata = {
  title: 'العرض المجسّم | ديار',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The content team's work list for the reveal (Le Dévoilement; 0032): every
 * perfume with a verified primary photograph, those still without a relief
 * first. Each opens the tool that lifts its bottle out of the photograph.
 */
export default async function OpsReliefsPage() {
  const session = await activeOperator();
  if (!session) redirect('/ops');
  const rows = (await fetchReliefs()) ?? [];

  return (
    <main className="mx-auto max-w-phoneMax pb-9 lg:max-w-contentMax lg:px-8">
      <ConsoleHead
        kicker="Operations"
        title="العرض المجسّم"
        nav={<OpsNav current="reliefs" />}
        intro="لكل عطر صورته الرئيسية. من هنا تُقصّ زجاجته من الصورة لتقف وتتحرّك نفحاته حولها في صفحته — تلقائيًا للصورة ذات الخلفية السادة، أو برسم الحدود يدويًا لغيرها. كل حفظ يُسجَّل في سجل القرارات."
      />
      {rows.length === 0 ? (
        <p className="text-body text-ink2">لا توجد عطور لها صورة رئيسية موثّقة بعد.</p>
      ) : (
        <ul className="grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <li key={row.productId} className="bg-raised">
              <Link
                href={`/ops/reliefs/${row.productId}`}
                className="group grid grid-cols-[88px_1fr] items-center gap-4 p-4 transition-colors duration-base ease-out hover:bg-raised2"
              >
                <span className="relative block aspect-[4/5] overflow-hidden bg-plate">
                  <Image src={row.photoUrl} alt="" fill sizes="88px" className="object-cover" />
                </span>
                <span className="grid gap-1">
                  <span className="font-display text-h4 group-hover:text-accent">{row.name}</span>
                  <span className="text-small text-ink2">{row.brandName}</span>
                  <span className={`text-small ${row.relief ? 'text-ink' : 'text-accent'}`}>
                    {row.relief ? `جاهز — ${row.relief.method === 'automatic' ? 'قصّ تلقائي' : 'رسم يدوي'}` : 'بلا عرض مجسّم بعد'}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
