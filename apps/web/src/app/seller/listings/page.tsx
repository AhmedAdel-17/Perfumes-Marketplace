import { localeHref } from '@/core/href';
import { sellerText } from '@diyar/i18n';
import { getLocale } from '@/core/locale';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { api } from '@/core/api';
import { activeSellerSession } from '@/features/seller/actions';
import { SellerWorkspace } from '@/features/seller/SellerWorkspace';
import { ListingList } from '@/features/seller/ListingList';
export async function generateMetadata():Promise<Metadata>{const locale=await getLocale();return {title:sellerText(locale,"Products & stock")+' | DIYAR',robots:{index:false,follow:false}};}
export const dynamic='force-dynamic';
export default async function SellerListingsPage(){
  const locale = await getLocale(); const t = (value: string) => sellerText(locale,value);
const session=await activeSellerSession();if(!session)redirect(localeHref(locale,'/seller'));const caller=api({role:'seller',id:session.staffAuthUserId},session.sellerId);const[listings,brand]=await Promise.all([caller.listings.mine(),caller.listings.myBrand()]);return <SellerWorkspace current="listings" title={t("Products & stock")} description={t("Your products, publication status and recorded stock.")}><ListingList listings={listings} brandId={brand?.id??null}/></SellerWorkspace>;}
