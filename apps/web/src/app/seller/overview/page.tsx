import { localePath } from '@diyar/i18n';
import { sellerText } from '@diyar/i18n';
import { getLocale } from '@/core/locale';
import type { Metadata } from 'next';
import { Overview } from '@/features/seller/Overview';
import { SellerWorkspace } from '@/features/seller/SellerWorkspace';
export async function generateMetadata():Promise<Metadata>{const locale=await getLocale();return {title:sellerText(locale,"Overview")+' | DIYAR',robots:{index:false,follow:false}};}
export const dynamic = 'force-dynamic';
export default async function SellerOverviewPage() {
  const locale = await getLocale(); const t = (value: string) => sellerText(locale,value);

  return <SellerWorkspace current="overview" title={t("Overview")} description={t("Your priorities and house performance in one place.")}><Overview /></SellerWorkspace>;
}
