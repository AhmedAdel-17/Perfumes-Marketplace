import { localeHref } from '@/core/href';
import { COMMERCE_RECOVERY, sellerText } from '@diyar/i18n';
import { getLocale } from '@/core/locale';
import Link from 'next/link';
import { Icon } from '@diyar/ui';
import styles from './seller-workspace.module.css';

const destinations = [
 { key:'overview', href:'/seller/overview', label:"Overview", icon:Icon.Grid },
 { key:'orders', href:'/seller/orders', label:"Orders", icon:Icon.Bag },
 { key:'listings', href:'/seller/listings', label:"Products & stock", icon:Icon.Vial },
 { key:'returns', href:'/seller/returns', label:"Returns", icon:Icon.Return },
 { key:'payouts', href:'/seller/payouts', label:"Payouts & statements", icon:Icon.Card },
 { key:'customers', href:'/seller/customers', label:'Customers', icon:Icon.User },
 { key:'storefront', href:'/seller/storefront', label:'Storefront', icon:Icon.Grid },
 { key:'settings', href:'/seller/settings', label:"Account & help", icon:Icon.User },
] as const;
export type SellerSection = typeof destinations[number]['key'];
/** Shared navigation: active page is explicit, every destination is implemented. */
export async function SellerNav({ current }: { current:SellerSection }) {
  const locale = await getLocale(); const t = (value: string) => sellerText(locale,value);

 return <nav aria-label={t("House navigation")} className={styles.nav}>{destinations.map(item=><Link key={item.key} href={localeHref(locale,item.href)} aria-current={current===item.key?'page':undefined}><item.icon className="h-5 w-5 shrink-0" aria-hidden="true"/><span>{item.key==='storefront'?COMMERCE_RECOVERY[locale].storefront:t(item.label)}</span></Link>)}</nav>;
}
