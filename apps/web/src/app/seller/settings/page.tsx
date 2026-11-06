import { localeHref } from '@/core/href';
import { sellerText } from '@diyar/i18n';
import { getLocale } from '@/core/locale';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SellerWorkspace } from '@/features/seller/SellerWorkspace';
import { signOutSellerEverywhere } from '@/features/seller/actions';
export async function generateMetadata():Promise<Metadata>{const locale=await getLocale();return {title:sellerText(locale,"Account & help")+' | DIYAR',robots:{index:false,follow:false}};}
export const dynamic='force-dynamic';
export default async function SellerSettingsPage(){
  const locale = await getLocale(); const t = (value: string) => sellerText(locale,value);
return <SellerWorkspace current="settings" title={t("Account & help")} description={t("Manage access to your house and contact the platform team.")}><div className="grid gap-5 lg:grid-cols-2"><section className="border border-line bg-raised p-6"><h2 className="font-display text-h3">{t("Account security")}</h2><p className="mt-3 text-body leading-relaxed text-ink2">{t("End all sessions for this account after using a shared device. Other devices will require a new sign-in code.")}</p><form action={signOutSellerEverywhere}><button type="submit" className="mt-5 min-h-touch border border-danger px-5 text-body text-danger">{t("Sign out of all devices")}</button></form></section><section className="border border-line bg-raised p-6"><h2 className="font-display text-h3">{t("Need help?")}</h2><p className="mt-3 text-body leading-relaxed text-ink2">{t("Contact the platform team to update house details or team access. Include the relevant order or statement reference.")}</p><Link href={localeHref(locale,"/support")} className="mt-5 inline-flex min-h-touch items-center border border-line px-5 text-body">{t("Open support")}</Link></section></div></SellerWorkspace>;}
