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
import { Blocks } from '@/features/content/Blocks';
import { api } from '@/core/api';

export const dynamic = 'force-dynamic';

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const page = await api().content.read({ slug });
  if (!page) return { title: 'ديار' };
  return {
    title: `${page.title} | ديار`,
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

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-phoneMax px-5 pb-9 lg:max-w-proseMax lg:px-0 lg:pb-[88px]">
        {/*
          The one h1 on the page, so a block can only ever open a section. The
          domain refuses to publish a document whose first heading is a level 3
          for exactly this reason — the outline has to start somewhere.
        */}
        <h1 className="pb-2 pt-7 font-display text-h1 leading-heading lg:pb-3 lg:pt-9 lg:text-h1Lg">
          {page.title}
        </h1>

        <article className="pb-4">
          <Blocks blocks={page.blocks} images={page.images} />
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
