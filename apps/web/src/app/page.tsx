import { findHouseBySlug, findProductBySlug, listHouses, listPublishedProducts } from '@/core/catalogue';
import { api } from '@/core/api';
import { SpecimenCard } from '@/features/catalogue/SpecimenCard';
import { HouseIndex } from '@/features/catalogue/HouseIndex';
import { NoteIndex } from '@/features/home/NoteIndex';
import { SectionHead } from '@/features/shell/SectionHead';
import { Opening } from '@/features/home/Opening';
import { Promises } from '@/features/home/Promises';
import { Accords } from '@/features/home/Accords';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { Reveal } from '@/features/shell/Reveal';
import { Track } from '@/features/analytics/Track';
import { arrivalWindow } from '@diyar/api';
import { data as num, HOME } from '@diyar/i18n';
import { localeHref } from '@/core/href';
import { getLocale } from '@/core/locale';

export const dynamic = 'force-dynamic';

/** How many perfumes the shelf shows: one row of four at desktop. */
const REGISTER_SIZE = 4;

/** Desktop columns by how many perfumes are on the shelf. Spelled out so Tailwind sees each class. */
const SHELF_COLUMNS: Record<number, string> = {
  1: 'lg:grid-cols-2',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
};

/**
 * The home page — identity v3 (16 Nov 2026), over identity v2's palette and faces.
 *
 * Written for the person choosing a perfume (founder, 17 Oct 2026), top to
 * bottom: the opening and one perfume seen through its house's doorway (01),
 * what the shop stands by, what is new (02), the families as filled vials (03),
 * how to look by note (04), and who the houses are (05). How a house is
 * verified, and how one applies, are the houses' business: the apply page and
 * the band at the top of the footer, not the shop window. Every section prints
 * real rows — nothing here is a picture of a fact the database does not hold.
 */
export default async function Home() {
  const locale = await getLocale();
  const copy = HOME[locale];

  const [products, curation, houses, notes] = await Promise.all([
    listPublishedProducts(),
    api().site.curation(),
    listHouses(),
    api().catalogue.noteIndex({ perTier: 5 }),
  ]);

  /*
   * Which perfume opens the site is a DECISION — the operators' (`/ops/site`).
   * Without one, the most recently published perfume that can be BOUGHT: the
   * label carries an Add to bag, and opening the site on a disabled button
   * reads as a shop that is closed. Only an operator can choose to feature a
   * perfume that is out of stock. A curated perfume that has since been
   * unpublished falls back too, rather than 404ing the front door.
   */
  const hero = (curation.heroProductId && products.find((p) => p.id === curation.heroProductId))
    || products.find((p) => p.inStock)
    || products[0];
  const heroDetail = hero ? await findProductBySlug(hero.slug) : null;
  const heroHouse = heroDetail?.houseSlug ? await findHouseBySlug(heroDetail.houseSlug) : null;

  /*
   * Section 02 is the operators' selection when they have made one, and the
   * newest perfumes when they have not — under a title that says which. The
   * curation control in /ops/site must keep doing something visible, and a
   * "new arrivals" heading over a hand-picked list would be untrue.
   */
  const featured = curation.featuredProductIds
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  const selected = featured.length > 0;
  const register = (selected ? featured : products.filter((p) => p.id !== hero?.id)).slice(0, REGISTER_SIZE);
  const ratings = register.length > 0
    ? await api().reviews.summaries({ productIds: register.map((p) => p.id) })
    : {};

  const hasNotes = notes.top.length > 0 || notes.heart.length > 0 || notes.base.length > 0;

  // The families the catalogue actually holds, fullest first.
  const tally = new Map<string, number>();
  for (const product of products) tally.set(product.family, (tally.get(product.family) ?? 0) + 1);
  const families = [...tally].map(([family, count]) => ({ family, count })).sort((a, b) => b.count - a.count);

  return (
    <>
      <SiteHeader />

      {/* The top of the funnel: somebody arrived. Renders nothing. */}
      <Track event="landing_view" />

      <main>
        {/* ------------------------------------------------------- 01 opening */}
        <Opening
          product={heroDetail}
          house={heroHouse}
          locale={locale}
          arrival={heroDetail ? arrivalWindow(heroDetail.fulfilmentHours) : null}
          houseCount={houses.length}
          perfumeCount={products.length}
          secondary={hasNotes
            ? { href: '#notes', label: copy.shopByScent }
            : { href: localeHref(locale, '/houses'), label: copy.meetHouses }}
        />

        {/* What the shop stands by, before the shelves. */}
        <Promises locale={locale} />

        {/* ---------------------------------------------- 02 new or selected */}
        <section aria-labelledby="register" className="mx-auto max-w-contentMax px-5 py-9 lg:px-8 lg:py-[112px]">
          <Reveal>
            <SectionHead
              id="register"
              index={copy.recentIndex}
              title={selected ? copy.selectedTitle : copy.recentTitle}
              link={products.length > 0
                ? { href: localeHref(locale, '/search'), label: copy.fullRegister(num(products.length)) }
                : undefined}
            />
          </Reveal>
          {products.length === 0 ? (
            /* Day one is a real state, not an edge case: the catalogue is empty
               until the first house goes live. */
            <p className="py-8 text-body text-ink3">{copy.empty}</p>
          ) : (
            /* A shelf with two perfumes on it gets two wide plates, not two
               quarter-width ones beside an empty half (law II). */
            <ul className={`grid grid-cols-2 gap-x-4 gap-y-8 lg:gap-x-6 ${SHELF_COLUMNS[Math.min(register.length, 4)] ?? ''}`}>
              {register.map((product, i) => (
                <Reveal as="li" key={product.id} delay={Math.min(i, 3) * 90}>
                  <SpecimenCard
                    product={product}
                    locale={locale}
                    rating={ratings[product.id]}
                    sizes={register.length <= 2 ? '(min-width: 1024px) 40vw, 50vw' : '(min-width: 1024px) 25vw, 50vw'}
                  />
                </Reveal>
              ))}
            </ul>
          )}
        </section>

        {/* -------------------------------------------------- 03 the families */}
        {families.length > 1 && (
          <section aria-labelledby="accords" className="mx-auto max-w-contentMax px-5 pb-9 lg:px-8 lg:pb-[112px]">
            <Reveal>
              <SectionHead id="accords" index={copy.accordsIndex} title={copy.accordsTitle} />
            </Reveal>
            <Accords families={families} locale={locale} />
          </section>
        )}

        {/* ----------------------------------------------------- 04 the notes */}
        {hasNotes && (
          <section aria-labelledby="notes" className="mx-auto max-w-contentMax px-5 pb-9 lg:px-8 lg:pb-[112px]">
            <Reveal>
              <SectionHead id="notes" index={copy.notesIndex} title={copy.notesTitle} />
            </Reveal>
            <Reveal>
              <NoteIndex index={notes} locale={locale} />
            </Reveal>
          </section>
        )}

        {/* ---------------------------------------------------- 05 the houses */}
        {houses.length > 0 && (
          <section aria-labelledby="houses" className="mx-auto max-w-contentMax px-5 pb-9 lg:px-8 lg:pb-[120px]">
            <Reveal>
              <SectionHead
                id="houses"
                index={copy.housesIndex}
                title={copy.housesTitle}
                link={{ href: localeHref(locale, '/houses'), label: copy.allHouses }}
              />
            </Reveal>
            <HouseIndex houses={houses} locale={locale} />
          </section>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
