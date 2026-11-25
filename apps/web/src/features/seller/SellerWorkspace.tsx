import { isArtDirectionPreview } from '@/features/art-direction/preview';
import { localeHref } from '@/core/href';
import { sellerText } from '@diyar/i18n';
import { getLocale } from '@/core/locale';
import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ART_WORKSPACE_STYLE, SELLER_WORKSPACE_STYLE } from '@diyar/tokens';
import { api } from '@/core/api';
import { Monogram } from '@/features/shell/Monogram';
import { LanguageSwitch } from '@/features/shell/LanguageSwitch';
import { ThemeToggle } from '@/features/shell/ThemeToggle';
import { activeSellerSession, signOutSeller } from './actions';
import { SellerNav, type SellerSection } from './SellerNav';
import styles from './seller-workspace.module.css';

/** Server-side composition: revocation-aware access wraps every workspace page.
 * Display metadata comes from the caller's own session context, never a URL id. */
export async function SellerWorkspace({current,title,description,actions,children}:{current:SellerSection;title:string;description?:string;actions?:ReactNode;children:ReactNode}) {
  const locale = await getLocale(); const t = (value: string) => sellerText(locale,value);

 const session=await activeSellerSession();
 if(!session) redirect(localeHref(locale,'/seller'));
 const house=await api({role:'seller',id:session.staffAuthUserId},session.sellerId).sellerWorkspace.profile();
 return <div data-art-direction={isArtDirectionPreview() ? 'true' : undefined} className={styles.workspace} style={(isArtDirectionPreview() ? ART_WORKSPACE_STYLE : SELLER_WORKSPACE_STYLE) as CSSProperties}>
  <aside className={styles.sidebar}>
   <Link href={localeHref(locale,"/seller/overview")} className={styles.brand} aria-label={t("DIYAR — Seller workspace")}><Monogram size={30}/><span lang="en">DIYAR</span></Link>
   <p className={styles.house}>{house?.name ?? t("Seller workspace")}</p>
   <SellerNav current={current}/>
   <div className={styles.sidebarFoot}>{house?.status==='live'&&<Link href={localeHref(locale,`/house/${house.slug}`)}>{t("View storefront ↗")}</Link>}<Link href={localeHref(locale,"/seller/settings")}>{t("Help and account")}</Link></div>
  </aside>
  <div className={styles.main}>
   <header className={styles.topbar}><span>{house?.name ?? t("Your house")} {t(" · Workspace")}</span><div className="flex items-center flex-wrap gap-3"><Link href={localeHref(locale,"/support")} className="tappable inline-flex min-h-touch items-center">{t("Help")}</Link><LanguageSwitch/><ThemeToggle/><form action={signOutSeller}><button type="submit" className="tappable min-h-touch px-3">{t("Sign out")}</button></form></div></header>
   <main id="seller-main" className={styles.content}><div className={styles.pagehead}><div><h1>{title}</h1>{description&&<p className="mt-2 text-body text-ink2">{description}</p>}</div>{actions}</div>{children}</main>
  </div>
 </div>;
}
