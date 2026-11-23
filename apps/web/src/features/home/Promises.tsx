import { HOME, type Locale } from '@diyar/i18n';
import { Reveal } from '@/features/shell/Reveal';

/**
 * What the shop promises, in three lines (identity v3, 16 Nov 2026).
 *
 * The opening's lede says all three in one sentence; a visitor deciding whether
 * to trust a shop they have not bought from reads for exactly these and should
 * not have to parse a sentence to find them. Each is something the product
 * already does and a published page already states — a source beside every
 * performance reading, one bag across houses with every delivery fee shown,
 * cash on delivery — so nothing here is a new promise.
 *
 * Numbered in the wordmark's own serif, because they are the house speaking.
 * No icons: three pictograms in a row is the most generated thing a storefront
 * can carry, and the words are the content.
 */
export function Promises({ locale }: { locale: Locale }) {
  const copy = HOME[locale];
  return (
    <section aria-label={copy.promisesLabel} className="border-y border-line bg-raised">
      <ol className="mx-auto grid max-w-contentMax gap-0 px-5 lg:grid-cols-3 lg:px-8">
        {copy.promises.map((promise, i) => (
          <Reveal as="li" key={promise.title} delay={i * 90} className="promise border-line py-7 lg:border-s lg:px-8 lg:py-9 lg:first:border-s-0 lg:first:ps-0 lg:last:pe-0 max-lg:border-t max-lg:first:border-t-0">
            <span aria-hidden="true" className="wordmark block text-h3 italic leading-none text-accent lg:text-h2Lg">
              {['i', 'ii', 'iii'][i]}
            </span>
            <h2 className="mt-4 font-display text-h4 leading-heading lg:text-h3">{promise.title}</h2>
            <p className="mt-2 max-w-[38ch] text-body leading-relaxed text-ink2 lg:text-bodyLg">{promise.body}</p>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}
