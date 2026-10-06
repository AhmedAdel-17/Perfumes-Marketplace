import Link from 'next/link';
import type { ProductCard } from '@/core/catalogue';
import { Flacon } from '@/features/product/Flacon';
import { ProductPhoto } from '@/features/product/ProductPhoto';
import {
  CURRENCY_LABEL, formatPrice, labelOf, langAttrs, data as num, pick, PRODUCT, SCENT_FAMILY,
  type Locale,
} from '@diyar/i18n';
import { localeHref } from '@/core/href';

/**
 * One product in a grid or a rail.
 *
 * The plate behind the flacon is a LIT SCENE, not a background colour: a single
 * warm source above and behind the bottle, falling off to near-black at the
 * corners. That falloff is what gives a flat panel depth, and it is why the
 * frame is an off-centre radial gradient rather than a fill.
 *
 * Hover does exactly one thing — the light comes up, over 640ms, so it reads as
 * a dimmer being turned rather than a state toggling. Nothing scales, nothing
 * lifts, nothing gains a shadow. A card that jumps under the cursor is a
 * consumer app, and the eye knows it instantly.
 *
 * The flacon is sized in PERCENTAGES of its frame, so the same component reads
 * correctly in a 148px rail card and a 300px desktop cell.
 */
export function ProductTile({ product, locale }: { product: ProductCard; locale: Locale }) {
  const name = pick(locale, product.name, product.nameEn);
  return (
    <Link href={localeHref(locale, `/p/${product.slug}`)} className="group block focus-visible:outline-none">
      <div className="relative aspect-[4/5] overflow-hidden bg-plate">
        <div className="absolute inset-0 bg-[radial-gradient(70%_56%_at_52%_22%,theme(colors.stage.glow)_0%,theme(colors.stage.mid)_48%,theme(colors.stage.deep)_88%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(52%_42%_at_52%_20%,rgba(196,160,96,.20),transparent_70%)] opacity-0 transition-opacity duration-slow ease-out group-hover:opacity-100" />

        {/* The house's own photograph when it has uploaded a verified one; the
            illustrated flacon until then. The lit plate, the hover light and the
            vignette apply to both, so a grid mixing the two still reads as one
            catalogue rather than as photographs beside drawings. */}
        {product.photo ? (
          <ProductPhoto photo={product.photo} sizes="(min-width: 1024px) 25vw, 50vw" />
        ) : (
          <Flacon
            family={product.family}
            house={product.brandLatin}
            uid={`tile-${product.id}`}
            className="absolute inset-0 h-full w-full px-[17%] py-[6%]"
          />
        )}

        {/* Grounding vignette: the corners of a lit scene are never as bright as
            its centre, and without this the tile reads as a sticker. */}
        <div className="absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_44%,transparent_36%,rgba(6,5,5,.60)_100%)]" />
      </div>

      {/*
        NO ALPHA on the accent here, and the missing `/90` is the whole note.

        Every ink role is tuned to sit just above 4.5:1 on the surfaces it is
        allowed on, so an opacity applied to one spends a margin that was never
        there: 90%% of the accent on paper measures 4.08:1. On noir the same
        utility looked like a refinement and cost nothing visible, which is
        exactly why it survived — softening an ink is a dark-theme habit that
        silently breaks the contract in the other direction.

        Soften a role by choosing a quieter role, never by making it
        transparent.
      */}
      <div className="latin mb-1.5 mt-4 text-micro tracking-label text-accent lg:text-caption">
        {product.brandLatin}
      </div>
      <div
        {...langAttrs(locale, name.lang)}
        className="font-display text-h4 leading-tight transition-colors duration-base ease-out group-hover:text-accent lg:text-h3Lg"
      >
        {name.text}
      </div>
      <div className="mt-1.5 text-caption text-ink3 lg:text-small">
        <span className="tnum">{num(product.volumeMl)}</span> {PRODUCT[locale].ml} · {labelOf(SCENT_FAMILY, locale, product.family)}
      </div>
      <div className="mt-2.5 text-bodyLg font-semibold">
        <span className="tnum">{formatPrice(product.pricePiastres)}</span>
        <span className="latin ms-2 text-micro tracking-label text-ink2">{CURRENCY_LABEL}</span>
      </div>
    </Link>
  );
}
