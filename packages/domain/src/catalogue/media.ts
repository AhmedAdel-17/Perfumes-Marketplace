/**
 * Product photographs — what a file actually is, and whether it may be used.
 *
 * Pattern — a pure policy over bytes (ENGINEERING_PRINCIPLES §4). No I/O: the
 * caller reads the first bytes of an uploaded object and hands them here.
 *
 * WHY THE BYTES AND NOT THE DECLARATION. A browser upload says what it is —
 * a filename ending in `.jpg`, a `Content-Type` header — and both are chosen
 * by whoever sent it. A marketplace that trusted them would store an HTML file
 * as a product photograph and serve it from its own domain. So the type and
 * the dimensions are read from the file's own header, and what was declared is
 * only ever compared against that.
 *
 * WHY EXIF ORIENTATION. A phone held upright writes a landscape JPEG and a note
 * saying "rotate this". Browsers obey the note. A reader that ignored it would
 * report every portrait photograph as landscape, and the page would reserve the
 * wrong-shaped space for it — the layout jumps the moment the photo arrives.
 * Houses photograph bottles upright, so this is the common case, not the edge.
 */

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

/**
 * The limits, and the reason for each.
 *
 * `minEdge` — a product page shows the photograph at up to ~1200px wide on a
 * retina phone. Below 800px on its shorter side it visibly softens there, and
 * a soft bottle beside a sharp one is the first thing that makes a luxury
 * catalogue look second-hand.
 *
 * `maxEdge` — decoding a 12,000px image takes hundreds of megabytes of memory
 * wherever it is resized. A camera's full resolution is well inside this.
 *
 * `maxBytes` — a phone JPEG is 2–6 MB. Ten leaves room for a PNG export without
 * letting one upload cost what a hundred should.
 */
export const MEDIA_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  minEdge: 800,
  maxEdge: 8000,
  /** How much of the file the caller must read for `sniffImage` to see the header. */
  headerBytes: 256 * 1024,
} as const;

export interface ImageFacts {
  readonly type: ImageType;
  /** As DISPLAYED — after EXIF orientation is applied. */
  readonly width: number;
  readonly height: number;
}

const u16be = (b: Uint8Array, i: number) => ((b[i]! << 8) | b[i + 1]!) >>> 0;
const u32be = (b: Uint8Array, i: number) =>
  ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;

const startsWith = (b: Uint8Array, bytes: readonly number[], at = 0) =>
  bytes.every((v, k) => b[at + k] === v);

const ascii = (b: Uint8Array, at: number, text: string) =>
  [...text].every((c, k) => b[at + k] === c.charCodeAt(0));

function sniffPng(b: Uint8Array): ImageFacts | null {
  if (!startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return null;
  if (b.length < 24 || !ascii(b, 12, 'IHDR')) return null;
  return { type: 'image/png', width: u32be(b, 16), height: u32be(b, 20) };
}

/** The EXIF orientation value (1–8) inside an APP1 segment, or 1. */
function exifOrientation(b: Uint8Array, start: number, end: number): number {
  // APP1 payload: "Exif\0\0" then a TIFF header.
  if (!ascii(b, start, 'Exif') || b[start + 4] !== 0 || b[start + 5] !== 0) return 1;
  const tiff = start + 6;
  if (tiff + 8 > end) return 1;
  const little = b[tiff] === 0x49 && b[tiff + 1] === 0x49; // "II"
  const big = b[tiff] === 0x4d && b[tiff + 1] === 0x4d;    // "MM"
  if (!little && !big) return 1;

  const u16 = (i: number) => (little ? (b[i]! | (b[i + 1]! << 8)) : u16be(b, i));
  const u32 = (i: number) => (little
    ? (b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16) | (b[i + 3]! << 24)) >>> 0
    : u32be(b, i));

  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > end) return 1;
  const entries = u16(ifd);
  for (let n = 0; n < entries; n += 1) {
    const entry = ifd + 2 + n * 12;
    if (entry + 12 > end) return 1;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

function sniffJpeg(b: Uint8Array): ImageFacts | null {
  if (!startsWith(b, [0xff, 0xd8, 0xff])) return null;

  let orientation = 1;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;           // lost sync: not a JPEG we can read
    let marker = b[i + 1]!;
    while (marker === 0xff && i + 2 < b.length) { i += 1; marker = b[i + 1]!; }  // fill bytes

    // Markers with no length field.
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue; }
    if (marker === 0xd9 || marker === 0xda) return null; // end of image / start of scan with no frame

    const length = u16be(b, i + 2);
    if (length < 2) return null;
    const payload = i + 4;
    const end = i + 2 + length;

    if (marker === 0xe1) orientation = exifOrientation(b, payload, Math.min(end, b.length));

    // Start-of-frame markers carry the dimensions: C0–CF except C4, C8, CC.
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      if (payload + 5 > b.length) return null;
      const height = u16be(b, payload + 1);
      const width = u16be(b, payload + 3);
      // Orientations 5–8 turn the image a quarter: what is displayed is the
      // stored height across and the stored width down.
      const rotated = orientation >= 5 && orientation <= 8;
      return { type: 'image/jpeg', width: rotated ? height : width, height: rotated ? width : height };
    }
    i = end;
  }
  return null;
}

function sniffWebp(b: Uint8Array): ImageFacts | null {
  if (b.length < 30 || !ascii(b, 0, 'RIFF') || !ascii(b, 8, 'WEBP')) return null;

  if (ascii(b, 12, 'VP8 ')) {
    if (!startsWith(b, [0x9d, 0x01, 0x2a], 23)) return null;
    return {
      type: 'image/webp',
      width: (b[26]! | (b[27]! << 8)) & 0x3fff,
      height: (b[28]! | (b[29]! << 8)) & 0x3fff,
    };
  }
  if (ascii(b, 12, 'VP8L')) {
    if (b[20] !== 0x2f) return null;
    const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
    return {
      type: 'image/webp',
      width: 1 + (bits & 0x3fff),
      height: 1 + ((bits >>> 14) & 0x3fff),
    };
  }
  if (ascii(b, 12, 'VP8X')) {
    return {
      type: 'image/webp',
      width: 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)),
      height: 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16)),
    };
  }
  return null;
}

/**
 * What these bytes are, read from the file itself. Null when they are not a
 * JPEG, PNG or WebP this reader can see the dimensions of.
 */
export function sniffImage(bytes: Uint8Array): ImageFacts | null {
  return sniffPng(bytes) ?? sniffJpeg(bytes) ?? sniffWebp(bytes);
}

/**
 * Every reason a file may be refused, as a list a test can enumerate.
 *
 *  - `unsupported_type` — not a JPEG, PNG or WebP, or not readable as one;
 *  - `type_mismatch` — the header says one type and the upload declared another.
 */
export const IMAGE_OBJECTIONS = [
  'unsupported_type',
  'type_mismatch',
  'too_large_file',
  'too_small_dimensions',
  'too_large_dimensions',
] as const;

export type ImageObjection = (typeof IMAGE_OBJECTIONS)[number];

/**
 * Why an uploaded file may not become a product photograph. Empty when it may.
 *
 * Every objection at once, like every form here: a house told the file is too
 * small, re-exported, and then told it is also the wrong type has been told one
 * thing too few the first time.
 */
export function objectionsToImage(input: {
  readonly facts: ImageFacts | null;
  readonly declaredType: string;
  readonly byteSize: number;
  /**
   * A photograph's limits unless told otherwise. A relief's cut-out (0032) is
   * an image the platform MADE, of one slim bottle, and is held to its own.
   */
  readonly limits?: { readonly maxBytes: number; readonly minEdge: number; readonly maxEdge: number };
}): ImageObjection[] {
  const objections: ImageObjection[] = [];
  const limits = input.limits ?? MEDIA_LIMITS;

  if (input.byteSize > limits.maxBytes) objections.push('too_large_file');

  if (!input.facts) {
    objections.push('unsupported_type');
    return objections;
  }

  if (input.facts.type !== input.declaredType) objections.push('type_mismatch');

  const shorter = Math.min(input.facts.width, input.facts.height);
  const longer = Math.max(input.facts.width, input.facts.height);
  if (shorter < limits.minEdge) objections.push('too_small_dimensions');
  if (longer > limits.maxEdge) objections.push('too_large_dimensions');

  return objections;
}

const EXTENSION: Readonly<Record<ImageType, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const isImageType = (value: string): value is ImageType =>
  (IMAGE_TYPES as readonly string[]).includes(value);

/**
 * Where an upload is stored.
 *
 * Random, never derived from the filename a house chose: a filename is
 * user input, can collide, and can say things a public URL should not. The
 * randomness is INJECTED, as it is for order references, so the domain stays
 * free of `crypto` and the tests stay deterministic.
 *
 * The owner's id is in the path so an operator reading a bucket listing can
 * tell whose image a key is without a database query.
 */
function mediaKey(
  prefix: 'products' | 'content' | 'reliefs',
  ownerId: string,
  type: ImageType,
  randomBytes: (count: number) => Uint8Array,
): string {
  const token = [...randomBytes(12)].map((v) => v.toString(16).padStart(2, '0')).join('');
  return `${prefix}/${ownerId}/${token}.${EXTENSION[type]}`;
}

/** A product photograph's key, under its product. */
export function productMediaKey(
  productId: string,
  type: ImageType,
  randomBytes: (count: number) => Uint8Array,
): string {
  return mediaKey('products', productId, type, randomBytes);
}

/**
 * An editorial image's key, under its page — the shape migration 0022 CHECKs.
 *
 * Its own prefix, never `products/`: an operator's upload and a house's
 * photograph are different rows with different policies, and a key that could
 * be read as either is a key one of them could be tricked into accepting.
 */
export function contentMediaKey(
  pageId: string,
  type: ImageType,
  randomBytes: (count: number) => Uint8Array,
): string {
  return mediaKey('content', pageId, type, randomBytes);
}

/**
 * A relief's file — its cut-out or its relief map — under its product.
 *
 * Its own prefix, like editorial images: a relief is made by the platform,
 * and a key that could be read as a house's photograph is a key a house's
 * upload could be tricked into claiming (migration 0032 CHECKs the shape).
 */
export function reliefMediaKey(productId: string, randomBytes: (count: number) => Uint8Array): string {
  return mediaKey('reliefs', productId, 'image/png', randomBytes);
}
