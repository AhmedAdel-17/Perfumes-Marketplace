import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SELLER_WORKSPACE_STYLE } from '@diyar/tokens';
import { api } from '@/core/api';
import { Monogram } from '@/features/shell/Monogram';
import { ThemeToggle } from '@/features/shell/ThemeToggle';
import { activeSellerSession, signOutSeller } from './actions';
import { SellerNav, type SellerSection } from './SellerNav';
import styles from './seller-workspace.module.css';

/** Server-side composition: revocation-aware access wraps every workspace page.
 * Display metadata comes from the caller's own session context, never a URL id. */
export async function SellerWorkspace({current,title,description,actions,children}:{current:SellerSection;title:string;description?:string;actions?:ReactNode;children:ReactNode}) {
 const session=await activeSellerSession();
 if(!session) redirect('/seller');
 const house=await api({role:'seller',id:session.staffAuthUserId},session.sellerId).sellerWorkspace.profile();
 return <div className={styles.workspace} style={SELLER_WORKSPACE_STYLE as CSSProperties}>
  <aside className={styles.sidebar}>
   <Link href="/seller/overview" className={styles.brand} aria-label="ديار — لوحة الدار"><Monogram size={30}/><span lang="en">DIYAR</span></Link>
   <p className={styles.house}>{house?.name ?? 'مساحة عمل الدار'}</p>
   <SellerNav current={current}/>
   <div className={styles.sidebarFoot}>{house?.status==='live'&&<Link href={`/house/${house.slug}`}>عرض واجهة الدار ↗</Link>}<Link href="/seller/settings">المساعدة والحساب</Link></div>
  </aside>
  <div className={styles.main}>
   <header className={styles.topbar}><span>{house?.name ?? 'دارك'} · مساحة العمل</span><div className="flex items-center gap-4"><Link href="/support" className="tappable inline-flex min-h-touch items-center">المساعدة</Link><ThemeToggle/><form action={signOutSeller}><button type="submit" className="tappable min-h-touch px-3">خروج</button></form></div></header>
   <main id="seller-main" className={styles.content}><div className={styles.pagehead}><div><h1>{title}</h1>{description&&<p className="mt-2 text-body text-ink2">{description}</p>}</div>{actions}</div>{children}</main>
  </div>
 </div>;
}
