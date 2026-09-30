/**
 * Rendering a content block.
 *
 * Pattern — a registry keyed by block kind (Open-Closed). A new block is a new
 * entry here and a new member of the domain union; it is never a new arm added
 * to a switch somewhere, and the compiler will not let the two lists drift
 * because `Record<BlockKind, …>` has to be complete.
 *
 * THE EDITOR CHOOSES NOTHING ABOUT APPEARANCE. Every size, colour and rhythm on
 * this page comes from the same tokens the product pages use, so an editorial
 * page and a product page are visibly the same publication. That is the whole
 * argument for a closed block set: a rich-text field would let someone paste a
 * heading in the wrong size and there would be no way to say they were wrong.
 */
import type {
  Block, BlockKind, CallToActionBlock, HeadingBlock, ImageBlock, NoteListBlock,
  PassageBlock, PullQuoteBlock,
} from '@diyar/domain';
import { localePath, SHELL, type Locale } from '@diyar/i18n';
import { ProductPhoto } from '@/features/product/ProductPhoto';

/** A verified editorial image, as the API hands it over: an address and its real size. */
export interface ContentImageView {
  readonly url: string;
  readonly width: number;
  readonly height: number;
}

export type ContentImages = Readonly<Record<string, ContentImageView>>;

/**
 * Paragraphs are separated by a blank line, and nothing else is markup.
 *
 * A single newline inside a paragraph is a soft wrap in the editor's own text
 * and must not become a break here — writers use them for line length, and
 * honouring them would put a ragged edge into justified Arabic prose.
 */
function paragraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

function Heading({ block }: { block: HeadingBlock }) {
  // The page's own title is the h1, so a block can only ever open a section or
  // a sub-section. The domain refuses to publish a document that starts at 3.
  if (block.level === 2) {
    return (
      <h2 className="mt-11 font-display text-h3 leading-heading text-ink lg:mt-14 lg:text-h2Lg">
        {block.text}
      </h2>
    );
  }
  return (
    <h3 className="mt-8 font-display text-h4 leading-heading text-ink lg:mt-10 lg:text-h3">
      {block.text}
    </h3>
  );
}

function Passage({ block }: { block: PassageBlock }) {
  return (
    <>
      {paragraphs(block.text).map((p, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <p key={i} className="mt-5 text-bodyLg leading-relaxed text-ink2">
          {p}
        </p>
      ))}
    </>
  );
}

function PullQuote({ block }: { block: PullQuoteBlock }) {
  /*
   * Set larger and in the display face, with a brass rule on the leading edge.
   *
   * `border-s` rather than `border-l`: this is a logical property, so the rule
   * sits on the right in Arabic and would move to the left if a second locale
   * ever arrives. A physical side would be correct today and silently wrong
   * the day it stopped being.
   */
  return (
    <figure className="mt-10 border-s-2 border-accent/60 ps-6 lg:mt-12 lg:ps-8">
      <blockquote className="font-display text-h4 leading-heading text-ink lg:text-h3">
        {block.text}
      </blockquote>
      {block.attribution && (
        <figcaption className="mt-3 text-caption tracking-label text-ink3">
          {block.attribution}
        </figcaption>
      )}
    </figure>
  );
}

function NoteList({ block }: { block: NoteListBlock }) {
  return (
    <dl className="mt-8 border-t border-line">
      {block.items.map((item) => (
        <div
          key={item.term}
          className="flex flex-col gap-1 border-b border-line py-4 sm:flex-row sm:gap-6"
        >
          {/*
            110px, not 180.

            The term is right-aligned inside its own column, so any width the
            term does not use becomes empty space BETWEEN the term and its
            detail — and at 180px that was a 100px hole in the middle of every
            row, which reads as two unrelated columns rather than a definition.
            Wide enough that the longest term here does not wrap, and no wider.
          */}
          <dt className="font-display text-bodyLg text-ink sm:w-[110px] sm:shrink-0">
            {item.term}
          </dt>
          {item.detail && (
            <dd className="text-small leading-relaxed text-ink2">{item.detail}</dd>
          )}
        </div>
      ))}
    </dl>
  );
}

function ContentImage(
  { block, image, locale }: { block: ImageBlock; image: ContentImageView | undefined; locale: Locale },
) {
  /*
   * `mediaKey`, not a URL — the origin of an asset is infrastructure, not
   * content, and a stored URL is a stored decision about hosting that outlives
   * the hosting. The API resolves the key to an address, and only for an image
   * the server verified (`content_images`, 0022).
   *
   * At its OWN proportions, not cropped into a house frame: an editorial image
   * was chosen for what is in it, and a 3:2 crop of a portrait loses the half
   * somebody framed on purpose.
   *
   * A key with no verified image draws the visible frame. A published page
   * cannot reach that — publishing refuses it — but a preview of a draft can,
   * and a placeholder an editor can see is a placeholder that gets fixed.
   */
  return (
    <figure className="mt-10">
      {image ? (
        <div
          className="relative w-full overflow-hidden bg-raised"
          // Data, not design: the proportions of this file, read from its bytes.
          style={{ aspectRatio: `${image.width} / ${image.height}` }}
        >
          <ProductPhoto
            photo={{ url: image.url, alt: block.alt, width: image.width, height: image.height }}
            sizes="(min-width: 1024px) 50vw, 100vw"
          />
        </div>
      ) : (
        <div
          className="flex aspect-[3/2] w-full items-center justify-center border border-line bg-raised"
          role="img"
          aria-label={block.alt}
        >
          <span className="text-micro tracking-label text-ink3">{SHELL[locale].imagePlaceholder}</span>
        </div>
      )}
      {block.caption && (
        <figcaption className="mt-3 text-caption text-ink3">{block.caption}</figcaption>
      )}
    </figure>
  );
}

function Divider() {
  // Decorative: it separates, it does not say anything, so it is hidden from a
  // screen reader rather than announced as a horizontal rule.
  return <hr className="mx-auto mt-12 w-16 border-0 border-t border-accent/40" aria-hidden />;
}

function CallToAction({ block, locale }: { block: CallToActionBlock; locale: Locale }) {
  return (
    <div className="mt-10">
      <a
        // An editor writes `/returns`; on the English site that is `/en/returns`.
        href={localePath(locale, block.href)}
        className="tappable inline-flex min-h-touch items-center border-b border-accent/50 pb-2 text-bodyLg text-ink transition-colors duration-base ease-out hover:border-accent hover:text-accent"
      >
        {block.label}
      </a>
    </div>
  );
}

/**
 * The registry.
 *
 * Typed as a complete `Record` over `BlockKind`, so adding a kind to the domain
 * and forgetting to render it is a build failure rather than a blank space on a
 * published page.
 */
const RENDERERS: {
  [K in BlockKind]: (
    block: Extract<Block, { kind: K }>, key: number, images: ContentImages, locale: Locale,
  ) => React.ReactNode;
} = {
  heading: (block, key) => <Heading key={key} block={block} />,
  passage: (block, key) => <Passage key={key} block={block} />,
  pull_quote: (block, key) => <PullQuote key={key} block={block} />,
  note_list: (block, key) => <NoteList key={key} block={block} />,
  image: (block, key, images, locale) => (
    <ContentImage key={key} block={block} image={images[block.mediaKey]} locale={locale} />
  ),
  divider: (_block, key) => <Divider key={key} />,
  call_to_action: (block, key, _images, locale) => <CallToAction key={key} block={block} locale={locale} />,
};

export function Blocks(
  { blocks, images, locale }: { blocks: readonly Block[]; images: ContentImages; locale: Locale },
) {
  return (
    <>
      {blocks.map((block, index) => {
        // The cast is the one place the discriminated union has to be
        // re-associated with its renderer; every other site is checked.
        const render = RENDERERS[block.kind] as (
          b: Block, k: number, i: ContentImages, l: Locale,
        ) => React.ReactNode;
        return render(block, index, images, locale);
      })}
    </>
  );
}
