import { localePath } from '@diyar/i18n';
import { sellerText } from '@diyar/i18n';
import { getLocale } from '@/core/locale';
import type { Metadata } from 'next';
import { SellerWorkspace } from '@/features/seller/SellerWorkspace';
import { ReturnQueue } from '@/features/seller/ReturnQueue';
export async function generateMetadata():Promise<Metadata>{const locale=await getLocale();return {title:sellerText(locale,"Returns")+' | DIYAR',robots:{index:false,follow:false}};}
export const dynamic='force-dynamic';
export default async function SellerReturnsPage(){
  const locale = await getLocale(); const t = (value: string) => sellerText(locale,value);
return <SellerWorkspace current="returns" title={t("Returns")} description={t("Review reasons, make decisions and track returns. The platform records refunds.")}><ReturnQueue/></SellerWorkspace>;}
