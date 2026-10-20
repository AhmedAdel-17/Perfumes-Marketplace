import Image, { getImageProps } from 'next/image';
import type { StorefrontPhoto } from '@/core/catalogue';

/** The widest copy of a photograph the loupe will ever load — beyond it, bytes for nobody's eye. */
const LOUPE_MAX_WIDTH = 2048;

/**
 * The same photograph, larger, for the loupe (Les Détails, 20 Oct 2026) —
 * through the SAME image pipeline as every other photograph, so the loader
 * decision still lives in this file alone. Never wider than the photograph
 * itself: the optimiser does not enlarge, and the loupe is told the true width
 * so it never magnifies past the detail the house's photograph holds.
 *
 * `getImageProps` answers with its 2x rendition, so half the wanted width is
 * asked for.
 */
export function loupeSource(photo: StorefrontPhoto): { src: string; width: number } {
  const width = Math.min(photo.width, LOUPE_MAX_WIDTH);
  const half = Math.ceil(width / 2);
  const { props } = getImageProps({
    src: photo.url,
    alt: '',
    width: half,
    height: Math.max(1, Math.round((half * photo.height) / photo.width)),
  });
  return { src: props.src, width };
}

/**
 * A product photograph on the storefront.
 *
 * ONE COMPONENT, so the resizing decision lives in one file. TECH_STACK (M-1)
 * leaves it open whether variants come from Next's image optimisation or from
 * Cloudflare's; today it is Next's, and moving to Cloudflare means a custom
 * loader HERE and nowhere else.
 *
 * `fill`, always: every place a photograph appears is a frame with a shape the
 * design decided — a 4:5 tile, the hero plate — and the photograph is placed
 * into it, not allowed to decide its own size. `sizes` is required rather than
 * defaulted, because the default makes the browser download a photograph as
 * wide as the viewport for a tile a third of that, which on an Egyptian mobile
 * connection is the difference between a page and a wait.
 */
export function ProductPhoto({ photo, sizes, priority = false, className = '' }: {
  photo: StorefrontPhoto;
  /** How wide the frame is at each breakpoint — see the note above. */
  sizes: string;
  /** Only for the one photograph that is the page's largest paint. */
  priority?: boolean;
  className?: string;
}) {
  return (
    <Image
      src={photo.url}
      alt={photo.alt}
      fill
      sizes={sizes}
      priority={priority}
      className={`object-cover ${className}`}
    />
  );
}
