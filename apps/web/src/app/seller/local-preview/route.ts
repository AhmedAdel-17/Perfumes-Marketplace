import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { identity } from '@/core/identity';
import { issueSellerSession } from '@/features/seller/session';

/** Development adapter: explicit local demo access still creates a real,
 * revocable seller session. No access to network databases or other workspaces. */
export async function GET() {
  const request = await headers();
  const demoPath = process.env.PGLITE_DIR?.replaceAll('\\', '/').toLowerCase();
  if (
    process.env.NODE_ENV !== 'development'
    || process.env.DIYAR_LOCAL_SELLER_PREVIEW !== 'true'
    || process.env.DATABASE_URL
    || demoPath !== 'd:/diyar-local/tmp/diyar-mock-animation-preview/pg'
    || !['localhost:3100', '127.0.0.1:3100'].includes(request.get('host') ?? '')
    || request.get('sec-fetch-site') === 'cross-site'
  ) notFound();

  const principal = await identity.sellerByContactPhone('01001112222');
  if (!principal) notFound();
  await issueSellerSession(principal);
  redirect('/seller/overview');
}
