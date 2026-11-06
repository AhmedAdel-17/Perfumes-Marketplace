import { localePath } from '@diyar/i18n';
import { sellerText } from '@diyar/i18n';
import { getLocale } from '@/core/locale';
import type { Metadata } from 'next';
import { SellerWorkspace } from '@/features/seller/SellerWorkspace';
import { SellerPayouts } from '@/features/seller/Payouts';
export async function generateMetadata():Promise<Metadata>{const locale=await getLocale();return {title:sellerText(locale,"Payouts & statements")+' | DIYAR',robots:{index:false,follow:false}};}
export const dynamic='force-dynamic';
export default async function SellerPayoutsPage(){
  const locale = await getLocale(); const t = (value: string) => sellerText(locale,value);
return <SellerWorkspace current="payouts" title={t("Payouts & statements")} description={t("Review statement details and payment status. Statement net does not confirm a transfer.")}><SellerPayouts/></SellerWorkspace>;}
