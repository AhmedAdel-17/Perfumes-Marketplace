import type { Metadata } from 'next';
import { api } from '@/core/api';
import { getLocale } from '@/core/locale';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { Track } from '@/features/analytics/Track';
import { ScentMap, type MapPerfume, type MapWord } from '@/features/map/ScentMap';
import { thumbnail } from '@/features/product/ProductPhoto';
import { MAP, pick, SHELL } from '@diyar/i18n';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: `${MAP[locale].metaTitle} | ${SHELL[locale].titleSuffix}`,
    description: MAP[locale].metaDescription,
  };
}

/**
 * The scent map (La Carte olfactive — founder 19 Oct 2026; task P5.1.7): the
 * whole catalogue drawn as a night sky, from `catalogue.scentMap`.
 *
 * Server-rendered like every customer page: the panel's words — the title, the
 * families, their counts — arrive as HTML, so the page reads and is indexed
 * without script; the sky is drawn on the server too and turns once the
 * script arrives. Every image is a small copy, through the same pipeline as
 * every photograph, because a sky of full-size bottles is megabytes nobody
 * sees at seventy pixels.
 */
export default async function ScentMapPage() {
  const [locale, data] = await Promise.all([getLocale(), api().catalogue.scentMap()]);
  const perfumes: MapPerfume[] = data.perfumes.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: pick(locale, p.name, p.nameEn),
    house: pick(locale, p.brandName, p.brandNameEn),
    brandLatin: p.brandLatin,
    family: p.family,
    pricePiastres: p.pricePiastres,
    image: p.cutout
      ? { src: thumbnail(p.cutout.url, p.cutout.width, p.cutout.height, 240), cutout: true }
      : p.photo
        ? { src: thumbnail(p.photo.url, p.photo.width, p.photo.height, 160), cutout: false }
        : null,
    notes: { top: p.notesTop, heart: p.notesHeart, base: p.notesBase },
  }));
  const words: MapWord[] = data.glossary.map((g) => ({
    note: g.note,
    shown: locale === 'en' && g.en ? { text: g.en, lang: 'en' } : { text: g.note, lang: 'ar' },
    en: g.en,
    icon: g.icon,
    family: g.family,
  }));

  return (
    <>
      <SiteHeader />
      <Track event="scent_map_view" />
      <main>
        <ScentMap perfumes={perfumes} words={words} locale={locale} />
      </main>
      <SiteFooter />
    </>
  );
}
