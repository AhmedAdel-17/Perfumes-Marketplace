import Link from 'next/link';
import Image from 'next/image';
import { StaggerGrid } from './StorefrontMotion';
import styles from './ArtComposition.module.css';
import { ART_DIRECTION, langAttrs, languageOf, pick, type Locale } from '@diyar/i18n';
import { findHouseBySlug } from '@/core/catalogue';
import type { HouseLine } from '@/features/catalogue/HouseTable';
import { localeHref } from '@/core/href';

/** Architectural mood references for the local preview; never claimed as brand premises. */
const houseImages=['courtyard','desert','doorway','garden','facade','cairo'] as const;
export async function ArtHouseGrid({houses,locale}:{houses:readonly HouseLine[];locale:Locale}) {
 const details=await Promise.all(houses.map(h=>findHouseBySlug(h.slug)));
 const c=ART_DIRECTION[locale];
 return <StaggerGrid className={styles.houseGrid ?? ""}>
 {houses.map((house,i)=>{
  const detail=details[i];const name=pick(locale,house.name,house.nameEn);
  const photo=houseImages[i % houseImages.length] ?? 'courtyard';
  const bio=detail?.bio?pick(locale,detail.bio,detail.bioEn):null;
  return <li key={house.slug} className="min-w-0">
   <Link href={localeHref(locale,`/house/${house.slug}`)} className={`group ${styles.houseLink}`}>
    <div className={styles.houseFrame}>
     <Image src={`/art-direction/houses/${photo}.jpg`} alt="" fill sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw" className="transition-transform duration-slow ease-out group-hover:scale-[1.04] motion-reduce:transition-none"/>
     <span className={styles.houseImageLabel}>{c.houseIllustration}</span>
    </div>
    <div className={styles.houseBody}>
     {house.city&&<p {...langAttrs(locale,languageOf(house.city))} className="mb-2 text-small text-ink2">{house.city}</p>}
     <h2 {...langAttrs(locale,name.lang)} className="font-display text-h2 leading-heading">{name.text}</h2>
     {bio&&<p {...langAttrs(locale,bio.lang)} className="line-clamp-2">{bio.text}</p>}
     <p className={styles.houseAction}>{c.enter}<span aria-hidden="true">↗</span></p>
    </div>
   </Link>
  </li>;
 })}
 </StaggerGrid>;
}
