import Link from 'next/link';
import { Icon } from '@diyar/ui';
import styles from './seller-workspace.module.css';

const destinations = [
 { key:'overview', href:'/seller/overview', label:'نظرة عامة', icon:Icon.Grid },
 { key:'orders', href:'/seller/orders', label:'الطلبات', icon:Icon.Bag },
 { key:'listings', href:'/seller/listings', label:'المنتجات والمخزون', icon:Icon.Vial },
 { key:'returns', href:'/seller/returns', label:'الإرجاع', icon:Icon.Return },
 { key:'payouts', href:'/seller/payouts', label:'المستحقات والكشوف', icon:Icon.Card },
 { key:'settings', href:'/seller/settings', label:'الحساب والمساعدة', icon:Icon.User },
] as const;
export type SellerSection = typeof destinations[number]['key'];
/** Shared navigation: active page is explicit, every destination is implemented. */
export function SellerNav({ current }: { current:SellerSection }) {
 return <nav aria-label="أقسام الدار" className={styles.nav}>{destinations.map(item=><Link key={item.key} href={item.href} aria-current={current===item.key?'page':undefined}><item.icon className="h-5 w-5 shrink-0" aria-hidden="true"/><span>{item.label}</span></Link>)}</nav>;
}
