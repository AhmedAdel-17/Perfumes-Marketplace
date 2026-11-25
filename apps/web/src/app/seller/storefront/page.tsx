import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { COMMERCE_RECOVERY } from '@diyar/i18n';
import { api } from '@/core/api';
import { getLocale } from '@/core/locale';
import { localeHref } from '@/core/href';
import { activeSellerSession } from '@/features/seller/actions';
import { SellerWorkspace } from '@/features/seller/SellerWorkspace';
/** Read-only facade over the existing own-house metadata and public catalogue.
 * No mock save/publish/team mutations: editorial approval remains platform-controlled. */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Storefront | DIYAR', robots: { index: false, follow: false } };
export default async function StorefrontPage() {
    const locale = await getLocale(), c = COMMERCE_RECOVERY[locale];
    const session = await activeSellerSession();
    if (!session)
        redirect(localeHref(locale, '/seller'));
    const house = await api({ role: 'seller', id: session.staffAuthUserId }, session.sellerId).sellerWorkspace.profile();
    const published = house?.status === 'live' ? await api().catalogue.house({ slug: house.slug }) : null;
    const action = 'inline-flex min-h-touch items-center border border-line px-5 text-body text-accent';
    return <SellerWorkspace current="storefront" title={c.storefront} description={c.storefrontHelp}>
 <div className="grid gap-6 lg:grid-cols-2"><section className="border border-line bg-raised p-6">
 <h2 className="font-display text-h3">{house?.name}</h2>
 <p className="mt-3 text-body text-ink2">{c.houseStatus}: <span className="font-medium text-ink">{house?.status}</span></p>
 {published ? <><p className="mt-5 text-body leading-relaxed text-ink2">{locale === 'en' ? (published.bioEn ?? published.bio) : published.bio}</p><p className="mt-3 text-body text-ink2">{published.city}</p><Link className={action + ' mt-5'} href={localeHref(locale, ('/house/' + house!.slug) as Route)}>{c.publicStorefront} ↗</Link></> : <p className="mt-5 text-body text-ink2">{c.unavailableStorefront}</p>}
 </section><section className="border border-line bg-raised p-6"><h2 className="font-display text-h3">{c.manageProducts}</h2><Link className={action + ' mt-5'} href={localeHref(locale, '/seller/listings')}>{c.manageProducts} ↗</Link><Link className={action + ' mt-5'} href={{ pathname: localeHref(locale, '/support'), query: { subject: c.requestChanges + ' — ' + (house?.name ?? '') } }}>{c.requestChanges} ↗</Link></section></div>
 </SellerWorkspace>;
}
