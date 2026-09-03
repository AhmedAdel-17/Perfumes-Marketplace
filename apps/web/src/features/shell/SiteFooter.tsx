/**
 * The footer carries the two facts a buyer needs before they trust a price:
 * where the money is denominated, and who is actually shipping. Both come from
 * the founding pack, not from decoration.
 */
export function SiteFooter() {
  return (
    <footer className="mt-8 border-t border-hair">
      <div className="mx-auto max-w-contentMax px-5 py-7 lg:px-8 lg:py-8">
        <div className="latin text-h4 tracking-wordmark text-bone">DIYAR</div>
        <a
          href="/order"
          // A 10.5px label is a 33px line box. `tappable` adds 16 and still lands
          // short, so the TARGET gets a floor while the label stays small — the
          // same fix the bag link needed.
          className="tappable inline-flex min-h-touch items-center text-caption tracking-label text-dim transition-colors duration-base ease-out hover:text-brass"
        >
          تتبّع طلب
        </a>
        <p className="mt-4 max-w-proseMax text-small leading-relaxed text-faint">
          سوق للعطور المصرية المستقلّة. كل دار تُجهّز طلبها وتشحنه بنفسها، والأسعار
          بالجنيه المصري شاملة الضريبة.
        </p>
      </div>
    </footer>
  );
}
