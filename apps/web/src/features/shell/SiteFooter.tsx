import { api } from '@/core/api';
import { ThemeToggle } from './ThemeToggle';

/**
 * The footer carries the two facts a buyer needs before they trust a price:
 * where the money is denominated, and who is actually shipping. Both come from
 * the founding pack, not from decoration.
 */
export async function SiteFooter() {
  /*
   * The live editorial pages, read at render.
   *
   * A hardcoded list would be a second place that decides what is published,
   * and it would keep linking a page the day somebody archives it — a footer
   * pointing at a 404 on every screen of the site.
   */
  const pages = await api().content.directory();

  return (
    <footer className="mt-8 border-t border-line">
      <div className="mx-auto max-w-contentMax px-5 py-7 lg:px-8 lg:py-8">
        <div className="latin text-h4 tracking-wordmark text-ink">DIYAR</div>
        <nav className="mt-1 flex flex-wrap items-center gap-x-6" aria-label="روابط">
        <a
          href="/order"
          // A 10.5px label is a 33px line box. `tappable` adds 16 and still lands
          // short, so the TARGET gets a floor while the label stays small — the
          // same fix the bag link needed.
          className="tappable inline-flex min-h-touch items-center text-caption tracking-label text-ink2 transition-colors duration-base ease-out hover:text-accent"
        >
          تتبّع طلب
        </a>
        {pages.map((page) => (
          <a
            key={page.slug}
            href={`/${page.slug}`}
            className="tappable inline-flex min-h-touch items-center text-caption tracking-label text-ink2 transition-colors duration-base ease-out hover:text-accent"
          >
            {page.title}
          </a>
        ))}
        </nav>
        <p className="mt-4 max-w-proseMax text-small leading-relaxed text-ink3">
          سوق للعطور المصرية المستقلّة. كل دار تُجهّز طلبها وتشحنه بنفسها، والأسعار
          بالجنيه المصري شاملة الضريبة.
        </p>

        {/* The masthead carries this from `sm` up, where there is room for it.
            See the note in SiteHeader: one instance at any width. */}
        <div className="mt-6 sm:hidden">
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
