import Image from 'next/image';
import { EditorialHero } from './EditorialHero';
import { StaggerGrid } from './StorefrontMotion';
import styles from './ArtComposition.module.css';
import Link from 'next/link';
import { ART_DIRECTION, DESIGN_PREVIEW, HOME, langAttrs, pick, type Locale } from '@diyar/i18n';
import type { ProductCard } from '@/core/catalogue';
import type { IndexedNote } from '@diyar/api';
import type { CardRating } from '@/features/catalogue/SpecimenCard';
import { ArtProductCard } from './ArtProductCard';
import { ArtHouseGrid } from './ArtHouseGrid';
import type { HouseLine } from '@/features/catalogue/HouseTable';
import { NoteIndex } from '@/features/home/NoteIndex';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { primarySurface } from '@/features/shell/primary-surface';
import { Track } from '@/features/analytics/Track';
import { localeHref } from '@/core/href';

/**
 * Composition/decorator pattern: only the editorial presentation changes.
 * Catalogue facts, curation, prices, links and interactions keep their existing contracts.
 * The development toggle protects the established storefront while this is reviewed.
 */
export function ArtHome({ locale, products, houses, notes, ratings, selected }: {
  locale: Locale;
  products: readonly ProductCard[];
  houses: readonly HouseLine[];
  notes: Record<'top' | 'heart' | 'base', IndexedNote[]>;
  ratings: Record<string, CardRating>;
  selected: boolean;
}) {
  const c = ART_DIRECTION[locale];
  const hasNotes = Object.values(notes).some(tier => tier.length > 0);
  return <>
    <SiteHeader />
    <Track event="landing_view" />
    <main className={styles.home}>
      <div className={styles.reviewBar}><span>{c.preview}</span><a href={localeHref(locale,'/design-preview')}>{DESIGN_PREVIEW[locale].title} ↗</a></div>
      <EditorialHero locale={locale} />

      <section aria-labelledby="art-products" className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 id="art-products" className="font-display text-h2 leading-heading lg:text-h2Lg">{selected ? c.curated : c.featured}</h2>
          <Link href={localeHref(locale, '/search')} className="tappable inline-flex min-h-touch items-center text-bodyLg underline decoration-line underline-offset-4">{c.all}</Link>
        </div>
        {products.length ? <StaggerGrid className={styles.featured ?? ""}>
          {products.map(product => <li key={product.id}>
            <ArtProductCard product={product} locale={locale} rating={ratings[product.id]} />
          </li>)}
        </StaggerGrid> : <p className="text-bodyLg text-ink2">{HOME[locale].empty}</p>}
      </section>

      {houses.length > 0 && <section aria-labelledby="art-houses" className={styles.housesSection}>
        <div className={styles.section}>
          <div className={styles.houseIntro}><div><p className={styles.eyebrow}>{c.houses}</p><h2 id="art-houses">{c.houseTitle}</h2></div><p>{c.houseIntro}</p></div><ArtHouseGrid houses={houses} locale={locale} />
        </div>
      </section>}

      {hasNotes && <section aria-labelledby="art-notes" className={styles.section}>
        <h2 id="art-notes" className="font-display text-h2 lg:text-h1Lg">{c.notes}</h2>
        <p className="mb-7 mt-4 text-bodyLg text-ink2">{c.notesIntro}</p>
        <NoteIndex index={notes} locale={locale} />
        <Link href={localeHref(locale, '/scent-map')} className="tappable mt-7 inline-flex min-h-touch items-center text-bodyLg text-accent underline underline-offset-4">{c.map}</Link>
      </section>}
    </main>
    <SiteFooter />
  </>;
}

export function EditorialImage({ locale, priority = false }: { locale: Locale; priority?: boolean }) {
  return <figure>
    <div className="relative aspect-[4/3] overflow-hidden bg-plate">
      <Image src="/art-direction/atelier.webp" alt="" fill priority={priority} sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
    </div>
    <figcaption className="mt-3 text-small leading-relaxed text-ink3">{ART_DIRECTION[locale].illustration}</figcaption>
  </figure>;
}

export function ArtHouseOpening({ locale }: { locale: Locale }) {
  return <section className={styles.opening}><p>{ART_DIRECTION[locale].houseEdition}</p><p>{ART_DIRECTION[locale].edition}</p></section>;
}

export function ArtProductOpening({ locale }: { locale: Locale }) {
  const c = ART_DIRECTION[locale];
  return <div className="mx-auto max-w-contentMax px-5 lg:px-8"><div className={styles.opening}><p>{c.productEdition}</p><p>{c.productIntro}</p></div></div>;
}
