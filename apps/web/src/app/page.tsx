import Link from 'next/link';
import { listPublishedProducts } from '@/core/catalogue';
import { formatPrice, CURRENCY_LABEL, editorial } from '@diyar/i18n';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const products = await listPublishedProducts();

  return (
    <main className="mx-auto max-w-[420px] pb-8">
      <header className="flex items-center justify-between px-3 pb-2 pt-3">
        <span className="latin ps-3 text-h4 tracking-wordmark">DIYAR</span>
      </header>

      <section className="px-5 pb-6 pt-4">
        <h1 className="font-display text-h1 leading-heading">دور العطور المصرية</h1>
        <p className="mt-2 text-small leading-relaxed text-dim">
          {editorial(products.length)} عطرًا من دور مختارة، بمعلومات موحّدة وتقييمات موثّقة بالشراء.
        </p>
      </section>

      <div className="grid grid-cols-2 gap-4 px-5">
        {products.map((p) => (
          <Link key={p.id} href={`/p/${p.slug}`} className="block">
            <div className="relative aspect-[4/5] overflow-hidden bg-[radial-gradient(120%_100%_at_50%_30%,#3A2F26,#1A1512_62%,#0D0B0A)]">
              <div
                className="absolute end-1/2 top-1/2 h-[86px] w-[44px] translate-x-[-50%] translate-y-[-50%] rounded-sm"
                style={{ background: p.bottle }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-noir/[.72] to-transparent" />
            </div>
            <div className="latin mb-1 mt-3 text-micro tracking-label text-brass">{p.brandLatin}</div>
            <div className="font-display text-h4 leading-tight">{p.name}</div>
            <div className="mt-1 text-caption text-faint">
              <span className="tnum">{p.volumeMl}</span> مل · {p.familyLabel}
            </div>
            <div className="mt-2 text-bodyLg font-semibold">
              <span className="tnum">{formatPrice(p.pricePiastres)}</span>
              <span className="latin ms-2 text-micro tracking-label text-dim">{CURRENCY_LABEL}</span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
