import Image from 'next/image';
import type { StorefrontPhoto } from '@/core/catalogue';

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
