import type { Metadata } from 'next';
import { Overview } from '@/features/seller/Overview';
import { SellerWorkspace } from '@/features/seller/SellerWorkspace';
export const metadata: Metadata = { title: 'نظرة عامة | ديار', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default function SellerOverviewPage() {
  return <SellerWorkspace current="overview" title="نظرة عامة" description="أولويات اليوم وحالة عمل دارك في مكان واحد."><Overview /></SellerWorkspace>;
}
