import { localePath } from '@diyar/i18n';
import { sellerText } from '@diyar/i18n';
import { getLocale } from '@/core/locale';
import type { Metadata } from 'next';
import { SellerWorkspace } from '@/features/seller/SellerWorkspace';
import { OrderQueue } from '@/features/seller/OrderQueue';
export async function generateMetadata():Promise<Metadata>{const locale=await getLocale();return {title:sellerText(locale,"Orders")+' | DIYAR',robots:{index:false,follow:false}};}
export const dynamic='force-dynamic';
export default async function SellerOrdersPage(){
  const locale = await getLocale(); const t = (value: string) => sellerText(locale,value);
return <SellerWorkspace current="orders" title={t("Orders")} description={t("Review orders, confirm stock and prepare shipments.")}><OrderQueue/></SellerWorkspace>;}
