import Image, { getImageProps } from 'next/image';
import type { StorefrontPhoto } from '@/core/catalogue';

/**
 * A small copy of a photograph or a cut-out — `width` pixels wide at most, for
 * a picture drawn small, such as a perfume on the scent map — through the same
 * pipeline as every other photograph.
 */
export function thumbnail(url: string, naturalWidth: number, naturalHeight: number, width: number): string {
  // `getImageProps` answers with its 2x rendition, so half the wanted width is asked for.
  const half = Math.ceil(Math.min(width, naturalWidth) / 2);
  const { props } = getImageProps({
    src: url,
    alt: '',
    width: half,
    height: Math.max(1, Math.round((half * naturalHeight) / naturalWidth)),
  });
  return props.src;
}

/** The widest copy of a photograph the loupe will ever load — beyond it, bytes for nobody's eye. */
const LOUPE_MAX_WIDTH = 2048;

/**
 * The same photograph, larger, for the loupe (Les Détails, 20 Oct 2026) —
 * through the SAME image pipeline as every other photograph, so the loader
 * decision still lives in this file alone. Never wider than the photograph
 * itself: the optimiser does not enlarge, and the loupe is told the true width
 * so it never magnifies past the detail the house's photograph holds.
 */
export function loupeSource(photo: StorefrontPhoto): { src: string; width: number } {
  return {
    src: thumbnail(photo.url, photo.width, photo.height, LOUPE_MAX_WIDTH),
    width: Math.min(photo.width, LOUPE_MAX_WIDTH),
  };
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
