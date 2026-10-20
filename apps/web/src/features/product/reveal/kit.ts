/**
 * What a card says for the reveal to start from it — the reveal as the way
 * into a perfume's page, the first time it is opened in a visit (founder,
 * 20 Oct 2026; `RevealDirector`).
 *
 * Written on the card as ONE data attribute (`data-reveal-card`) and read back
 * when the card is pressed, the way `data-full-load` already tells the route
 * loader about a link: the card stays a server component and an ordinary link,
 * and a page of cards ships no script of its own.
 *
 * Only what the start needs: which perfume, where its page is, the shape of its
 * photograph, its relief (so the bottle starts loading while its photograph is
 * still in the air), its family (the mist's colour) and its name (the room is
 * named for it). Its house and its notes are NOT here — the perfume's own page
 * brings them when it arrives (`Landing`), and a page of twenty cards should
 * not carry twenty perfumes' notes for the one that is pressed.
 */
import type { Placement } from './bottle-gl';

export interface RevealKit {
  readonly id: string;
  /** The perfume's page, exactly as the card links to it. */
  readonly href: string;
  readonly family: string;
  readonly name: { readonly text: string; readonly lang: 'ar' | 'en' };
  readonly brandLatin: string;
  /** The primary photograph's own size: the frames show it `object-fit: cover`. */
  readonly photo: { readonly width: number; readonly height: number };
  readonly relief: { readonly cutoutUrl: string; readonly reliefUrl: string; readonly placement: Placement };
}

/** What a server component needs to know of a perfume to write its kit. */
export interface KitSource {
  readonly id: string;
  readonly family: string;
  readonly brandLatin: string;
  readonly photo: { readonly width: number; readonly height: number } | null;
  readonly relief: { readonly cutoutUrl: string; readonly reliefUrl: string; readonly placement: Placement } | null;
}

/**
 * The attribute's value, or undefined when the perfume cannot be revealed —
 * no photograph to lift, or no relief made from it — and the card stays a
 * plain link.
 */
export function writeKit(
  product: KitSource,
  href: string,
  name: { readonly text: string; readonly lang: 'ar' | 'en' },
): string | undefined {
  if (!product.photo || !product.relief) return undefined;
  const kit: RevealKit = {
    id: product.id,
    href,
    family: product.family,
    name: { text: name.text, lang: name.lang },
    brandLatin: product.brandLatin,
    photo: { width: product.photo.width, height: product.photo.height },
    relief: {
      cutoutUrl: product.relief.cutoutUrl,
      reliefUrl: product.relief.reliefUrl,
      placement: { ...product.relief.placement },
    },
  };
  return JSON.stringify(kit);
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isSize = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * The kit back from the page, or null when the attribute is missing or is not
 * one — the press is then left to the link. Checked field by field: it is read
 * from the DOM, which anything on the page can write to.
 */
export function readKit(raw: string | null | undefined): RevealKit | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const { id, href, family, name, brandLatin, photo, relief } = value;
  if (!isText(id) || !isText(href) || !href.startsWith('/') || !isText(family) || !isText(brandLatin)) return null;
  if (!isRecord(name) || !isText(name.text) || (name.lang !== 'ar' && name.lang !== 'en')) return null;
  if (!isRecord(photo) || !isSize(photo.width) || !isSize(photo.height)) return null;
  if (!isRecord(relief) || !isText(relief.cutoutUrl) || !isText(relief.reliefUrl) || !isRecord(relief.placement)) return null;
  const { centreX, centreY, height, angle } = relief.placement;
  if (!isNumber(centreX) || !isNumber(centreY) || !isSize(height) || !isNumber(angle)) return null;
  return {
    id, href, family, brandLatin,
    name: { text: name.text, lang: name.lang },
    photo: { width: photo.width, height: photo.height },
    relief: { cutoutUrl: relief.cutoutUrl, reliefUrl: relief.reliefUrl, placement: { centreX, centreY, height, angle } },
  };
}
