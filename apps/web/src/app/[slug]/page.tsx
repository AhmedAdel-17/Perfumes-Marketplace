/**
 * An editorial page.
 *
 * A catch-all at the site root, and that placement is deliberate: an editorial
 * page's URL should be `/about`, not `/pages/about`. Next matches static routes
 * before dynamic ones, so `/cart` and `/checkout` keep working, and the domain's
 * `isUsableSlug` refuses those slugs anyway — belt and braces, because the
 * failure mode here is the shop breaking rather than a page 404ing.
 *
 * Rendered on the server from the published revision. `notFound()` covers both
 * "no such page" and "not published", which is correct: from outside, a draft
 * and a page that does not exist are the same thing, and any difference between
 * the two responses would tell a stranger which slugs are being worked on.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { PageHead } from '@/features/shell/PageHead';
import { Blocks } from '@/features/content/Blocks';
import { api } from '@/core/api';
import { langAttrs, SHELL, type Locale } from '@diyar/i18n';
import { getLocale } from '@/core/locale';

export const dynamic = 'force-dynamic';

type Page = NonNullable<Awaited<ReturnType<ReturnType<typeof api>['content']['read']>>>;

/**
 * Which half of a page a visitor reads.
 *
 * The English half when the page is English and the published revision has
 * one; otherwise the Arabic, WHOLE — title and blocks together, marked as
 * Arabic. Mixing an English title over Arabic blocks would be a page in two
 * languages that is complete in neither.
 */
function served(page: Page, locale: Locale) {
  if (locale === 'en' && page.blocksEn.length > 0) {
    return { title: page.titleEn ?? page.title, blocks: page.blocksEn, lang: 'en' as const };
  }
  return { title: page.title, blocks: page.blocks, lang: 'ar' as const };
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const page = await api().content.read({ slug });
  const locale = await getLocale();
  const suffix = SHELL[locale].titleSuffix;
  if (!page) return { title: suffix };
  return {
    title: `${served(page, locale).title} | ${suffix}`,
    // No description invented from the body. A truncated first paragraph is a
    // worse summary than none, and it is the kind of thing that reads as
    // machine-written on the one surface people meet before the site.
  };
}

export default async function ContentPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const page = await api().content.read({ slug });
  if (!page) notFound();
  const locale = await getLocale();
  const shown = served(page, locale);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-phoneMax px-5 pb-9 lg:max-w-proseMax lg:px-0 lg:pb-[104px]">
        {/*
          The one h1 on the page, so a block can only ever open a section. The
          domain refuses to publish a document whose first heading is a level 3
          for exactly this reason — the outline has to start somewhere.
        */}
        <div {...langAttrs(locale, shown.lang)}>
          <PageHead kicker={SHELL[locale].pageKicker} title={shown.title} />

          <article className="pb-4">
            <Blocks blocks={shown.blocks} images={page.images} locale={locale} />
          </article>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
