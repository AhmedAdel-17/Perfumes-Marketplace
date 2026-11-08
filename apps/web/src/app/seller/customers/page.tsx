import type { Metadata } from 'next';
import { sellerText } from '@diyar/i18n';
import { getLocale } from '@/core/locale';
import { SellerWorkspace } from '@/features/seller/SellerWorkspace';
import { CustomerLeaderboard } from '@/features/seller/CustomerLeaderboard';
export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: `${sellerText(locale, 'Customers')} | DIYAR`, robots: { index: false, follow: false } };
}
export default async function SellerCustomersPage() {
  const locale = await getLocale();
  return <SellerWorkspace current="customers" title={sellerText(locale, 'Customers')} description={sellerText(locale, 'Your customers, ranked by completed purchases from your house.')}><CustomerLeaderboard /></SellerWorkspace>;
}
