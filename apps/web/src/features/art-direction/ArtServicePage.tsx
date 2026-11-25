import type { ReactNode } from 'react';
import Link from 'next/link';
import { ART_DIRECTION, CART, ORDERS, type Locale } from '@diyar/i18n';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { localeHref } from '@/core/href';
import styles from './ArtExperience.module.css';

/** A presentation shell around the existing, unchanged transaction forms. */
export function ArtServicePage({locale,kind,children}:{locale:Locale;kind:'bag'|'checkout'|'order';children:ReactNode}) {
 const c=ART_DIRECTION[locale];
 const heading=kind==='bag'?CART[locale].title:kind==='order'?ORDERS[locale].title:null;
 return <><SiteHeader/><main data-service={kind} className={styles.service}>
 {heading&&<header className={styles.serviceHead}><h1>{heading}</h1></header>}
 <div className={styles.servicePanel}>{children}</div><nav className="mt-5 flex gap-5"><Link className="tappable inline-flex min-h-touch items-center text-body text-accent underline underline-offset-4" href={localeHref(locale,'/search')}>{c.shop}</Link><Link className="tappable inline-flex min-h-touch items-center text-body text-accent underline underline-offset-4" href={localeHref(locale,'/houses')}>{c.houses}</Link></nav>
 </main><SiteFooter/></>;
}
