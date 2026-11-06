import { localeHref } from '@/core/href';
import { sellerText } from '@diyar/i18n';
import { getLocale } from '@/core/locale';
import type { Metadata } from 'next';
import { LanguageSwitch } from '@/features/shell/LanguageSwitch';
import { PageHead } from '@/features/shell/PageHead';
import { redirect } from 'next/navigation';
import { SellerSignIn } from '@/features/seller/SignIn';
import { readSellerSession } from '@/features/seller/session';

export async function generateMetadata():Promise<Metadata>{const locale=await getLocale();return {title:sellerText(locale,"Seller sign-in")+' | DIYAR',robots:{index:false,follow:false}};}

export default async function SellerSignInPage() {
  const locale = await getLocale(); const t = (value: string) => sellerText(locale,value);

  // Already signed in — a sign-in form shown to someone who is signed in is a
  // dead end they have to guess their way out of.
  if (await readSellerSession()) redirect(localeHref(locale,'/seller/overview'));

  return (
    <main className="mx-auto max-w-phoneMax pb-9 lg:max-w-[560px] lg:px-8">
      {/* Identity v2: the register's page head, at the measure of a form. */}
      <PageHead kicker="For Houses" title={t("Seller portal")} className="mx-5 mb-7 lg:mx-0 lg:mt-[56px]" />
      <div className="mb-5 flex justify-end"><LanguageSwitch/></div><SellerSignIn />
    </main>
  );
}
