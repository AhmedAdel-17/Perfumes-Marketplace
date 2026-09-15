import { describe, expect, it } from 'vitest';
import {
  MEDIA_LIMITS, objectionsToImage, productMediaKey, sniffImage,
} from './media';

/* --------------------------------------------------------- real file headers */

const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const le16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const text = (s: string) => [...s].map((c) => c.charCodeAt(0));

function png(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...be32(13), ...text('IHDR'), ...be32(width), ...be32(height), 8, 2, 0, 0, 0,
  ]);
}

/** A JPEG header: SOI, optionally an EXIF orientation, then a baseline frame. */
function jpeg(width: number, height: number, orientation?: number, littleEndian = false): Uint8Array {
  const segments: number[] = [0xff, 0xd8];

  if (orientation !== undefined) {
    const u16 = littleEndian ? le16 : be16;
    const u32 = (n: number) => (littleEndian
      ? [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]
      : be32(n));
    const tiff = [
      ...(littleEndian ? text('II') : text('MM')), ...u16(42), ...u32(8),
      ...u16(1),                                   // one IFD entry
      ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0,
      ...u32(0),
    ];
    const payload = [...text('Exif'), 0, 0, ...tiff];
    segments.push(0xff, 0xe1, ...be16(payload.length + 2), ...payload);
  }

  // An unrelated APP0 segment first, so the reader has to walk segments.
  const jfif = [...text('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  segments.push(0xff, 0xe0, ...be16(jfif.length + 2), ...jfif);

  segments.push(0xff, 0xc0, ...be16(17), 8, ...be16(height), ...be16(width), 3,
    1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1);
  segments.push(0xff, 0xda);
  return new Uint8Array(segments);
}

function webpLossy(width: number, height: number): Uint8Array {
  return new Uint8Array([
    ...text('RIFF'), 0, 0, 0, 0, ...text('WEBP'), ...text('VP8 '), 0, 0, 0, 0,
    0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(width), ...le16(height),
  ]);
}

function webpExtended(width: number, height: number): Uint8Array {
  const w = width - 1;
  const h = height - 1;
  return new Uint8Array([
    ...text('RIFF'), 0, 0, 0, 0, ...text('WEBP'), ...text('VP8X'), 10, 0, 0, 0,
    0, 0, 0, 0,
    w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff,
    h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff,
  ]);
}

/* ---------------------------------------------------------------------- tests */

describe('what a file actually is, read from its own header', () => {
  it('reads a PNG', () => {
    expect(sniffImage(png(1600, 2000))).toEqual({ type: 'image/png', width: 1600, height: 2000 });
  });

  it('reads a JPEG, walking past the segments before the frame', () => {
    expect(sniffImage(jpeg(3024, 4032))).toEqual({ type: 'image/jpeg', width: 3024, height: 4032 });
  });

  it('reads lossy and extended WebP', () => {
    expect(sniffImage(webpLossy(1200, 1500))).toEqual({ type: 'image/webp', width: 1200, height: 1500 });
    expect(sniffImage(webpExtended(2400, 3000))).toEqual({ type: 'image/webp', width: 2400, height: 3000 });
  });

  it('reports an upright phone photograph as UPRIGHT — EXIF orientation applied', () => {
    /*
     * A phone held upright stores 4032×3024 and a note saying "rotate 90°".
     * Browsers obey the note, so the page must reserve a PORTRAIT box, or the
     * layout jumps the moment the bottle loads.
     */
    expect(sniffImage(jpeg(4032, 3024, 6))).toEqual({ type: 'image/jpeg', width: 3024, height: 4032 });
    expect(sniffImage(jpeg(4032, 3024, 6, true))).toEqual({ type: 'image/jpeg', width: 3024, height: 4032 });
  });

  it('leaves a photograph that needs no quarter-turn as stored', () => {
    expect(sniffImage(jpeg(4032, 3024, 1))).toEqual({ type: 'image/jpeg', width: 4032, height: 3024 });
    expect(sniffImage(jpeg(4032, 3024, 3))).toEqual({ type: 'image/jpeg', width: 4032, height: 3024 });
  });

  it('does not recognise HTML, a PDF, or a JPEG with no frame', () => {
    // The whole reason the header is read: a file called photo.jpg that is a
    // web page must not be stored and served as one of this site's images.
    expect(sniffImage(new Uint8Array(text('<!doctype html><script>alert(1)</script>')))).toBeNull();
    expect(sniffImage(new Uint8Array(text('%PDF-1.7 ...')))).toBeNull();
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xda]))).toBeNull();
    expect(sniffImage(new Uint8Array([]))).toBeNull();
  });
});

describe('whether a file may become a product photograph', () => {
  const ok = { type: 'image/jpeg' as const, width: 2400, height: 3000 };

  it('accepts a large, correctly declared photograph', () => {
    expect(objectionsToImage({ facts: ok, declaredType: 'image/jpeg', byteSize: 3_000_000 })).toEqual([]);
  });

  it('refuses a file that is not an image, whatever it was called', () => {
    expect(objectionsToImage({ facts: null, declaredType: 'image/jpeg', byteSize: 2_000 }))
      .toEqual(['unsupported_type']);
  });

  it('refuses a file whose header disagrees with what was declared', () => {
    expect(objectionsToImage({ facts: { ...ok, type: 'image/png' }, declaredType: 'image/jpeg', byteSize: 3_000_000 }))
      .toContain('type_mismatch');
  });

  it('refuses a photograph too small to stay sharp on a product page — by its SHORTER edge', () => {
    expect(objectionsToImage({ facts: { ...ok, width: 799, height: 3000 }, declaredType: 'image/jpeg', byteSize: 1 }))
      .toContain('too_small_dimensions');
    expect(objectionsToImage({ facts: { ...ok, width: 800, height: 800 }, declaredType: 'image/jpeg', byteSize: 1 }))
      .toEqual([]);
  });

  it('refuses one too large to decode sensibly, and a file over the size limit', () => {
    expect(objectionsToImage({ facts: { ...ok, width: 9000 }, declaredType: 'image/jpeg', byteSize: 1 }))
      .toContain('too_large_dimensions');
    expect(objectionsToImage({ facts: ok, declaredType: 'image/jpeg', byteSize: MEDIA_LIMITS.maxBytes + 1 }))
      .toContain('too_large_file');
  });

  it('reports every objection at once', () => {
    expect(objectionsToImage({
      facts: { type: 'image/png', width: 400, height: 400 },
      declaredType: 'image/jpeg',
      byteSize: MEDIA_LIMITS.maxBytes + 1,
    }).sort()).toEqual(['too_large_file', 'too_small_dimensions', 'type_mismatch']);
  });
});

describe('where an upload is stored', () => {
  const fixed = (count: number) => new Uint8Array(count).fill(0xab);

  it('is random, under the product, with the extension of the REAL type', () => {
    const key = productMediaKey('11111111-2222-3333-4444-555555555555', 'image/webp', fixed);
    expect(key).toBe(`products/11111111-2222-3333-4444-555555555555/${'ab'.repeat(12)}.webp`);
  });

  it('never carries the filename a house chose', () => {
    const key = productMediaKey('p1', 'image/jpeg', fixed);
    expect(key).not.toMatch(/\s|\.\.|[A-Z]/);
    expect(key.split('/')).toHaveLength(3);
  });
});
