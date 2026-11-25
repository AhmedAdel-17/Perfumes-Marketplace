import Link from 'next/link';
import { CONCENTRATION, CURRENCY_LABEL, formatPrice, labelOf, langAttrs, pick, PRODUCT, type Locale } from '@diyar/i18n';
import type { ProductCard } from '@/core/catalogue';
import { Blotter, type CardRating } from '@/features/catalogue/SpecimenCard';
import { ProductPhoto } from '@/features/product/ProductPhoto';
import { Flacon } from '@/features/product/Flacon';
import { writeKit } from '@/features/product/reveal/kit';
import { localeHref } from '@/core/href';
import styles from './ArtComposition.module.css';
/** Presentation only: retains the original note-paper, reveal frame, real price and genuine rating. */
export function ArtProductCard({product,locale,rating}:{product:ProductCard;locale:Locale;rating?:CardRating|undefined}) {
 const name=pick(locale,product.name,product.nameEn);const href=localeHref(locale,`/p/${product.slug}`);const kit=writeKit(product,href,name);
 return <article className={styles.productCard}><Link href={href} data-reveal-card={kit} className={`group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent ${styles.productLink}`}>
 <div data-reveal-frame={kit?'':undefined} className={styles.productFrame}>
 {product.photo?<ProductPhoto photo={product.photo} sizes="(min-width:1280px) 24vw, (min-width:640px) 33vw, 50vw" className={styles.productPhoto ?? ""}/>:<Flacon family={product.family} house={product.brandLatin} uid={`art-${product.id}`} className="absolute inset-0 h-full w-full p-8"/>}
 {product.topNotes.length>0&&<Blotter product={product} locale={locale}/>}
 </div><div className={styles.productInfo}><h3 {...langAttrs(locale,name.lang)} className={styles.productTitle}>{name.text}</h3><p lang="en" className={styles.productBrand}>{product.brandLatin}</p><p className={styles.productFacts}>{labelOf(CONCENTRATION,locale,product.concentration)} · <bdi>{product.volumeMl} {PRODUCT[locale].ml}</bdi></p>
 {product.topNotes.length>0&&<p className={styles.productNotes}>{product.topNotes.slice(0,3).map(n=>locale==='en'&&n.en?n.en:n.note).join(' · ')}</p>}
 <div className={styles.productBottom}><p className={styles.productPrice}><span className="tnum">{formatPrice(product.pricePiastres)}</span> <span className="text-small">{CURRENCY_LABEL}</span></p>{rating&&rating.count>0&&rating.overall!==null&&<p className={styles.productRating}><bdi>{rating.overall.toFixed(1)} / 5</bdi> · {rating.count}</p>}</div></div></Link></article>;
}
