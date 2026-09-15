import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { assertMediaKey, localMediaStore, r2MediaStore } from './media';

const KEY = `products/11111111-2222-3333-4444-555555555555/${'ab'.repeat(12)}.jpg`;
const NOW = new Date('2026-09-15T12:00:00Z');

describe('a media key', () => {
  it('is accepted only in the shape the domain produces', () => {
    expect(() => assertMediaKey(KEY)).not.toThrow();
  });

  it('refuses anything that could walk out of its place', () => {
    // A key becomes a disk path in one adapter and a URL in the other.
    for (const bad of [
      '../../etc/passwd',
      `products/p1/../../${'ab'.repeat(12)}.jpg`,
      `products/p1/${'ab'.repeat(12)}.html`,
      `products/p1/${'AB'.repeat(12)}.jpg`,
      'products/p1/photo.jpg',
      '',
    ]) {
      expect(() => assertMediaKey(bad), bad).toThrow();
    }
  });
});

describe('the local development store', () => {
  const root = mkdtempSync(join(tmpdir(), 'diyar-media-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const store = localMediaStore({ root, publicBaseUrl: 'http://localhost:3100/dev-media', secret: 'test-secret' });

  it('declares itself a stub — it cannot serve one file from several servers', () => {
    expect(store.isStub).toBe(true);
  });

  it('round-trips a file, and reports size and header from what is on disk', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6]);
    await store.write(KEY, bytes);

    expect(await store.describe(KEY)).toEqual({ byteSize: 10, contentType: null });
    expect(await store.readHeader(KEY, 4)).toEqual(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]));
    expect(await store.read(KEY)).toEqual(bytes);

    await store.remove(KEY);
    expect(await store.describe(KEY)).toBeNull();
    expect(await store.readHeader(KEY, 4)).toBeNull();
  });

  it('removing what is not there is not an error', async () => {
    await expect(store.remove(KEY)).resolves.toBeUndefined();
  });

  it('accepts an upload it signed, and refuses a tampered, re-typed or expired one', async () => {
    const upload = await store.presignUpload({ key: KEY, contentType: 'image/jpeg', expiresInSeconds: 600, now: NOW });
    const params = new URL(upload.url).searchParams;
    const base = {
      key: KEY,
      contentType: 'image/jpeg',
      expires: Number(params.get('expires')),
      signature: params.get('signature')!,
      now: NOW,
    };

    expect(store.verifyUpload(base)).toBe(true);
    expect(store.verifyUpload({ ...base, key: KEY.replace('ab', 'cd') })).toBe(false);
    // The signature covers the declared type: a URL issued for a JPEG is not a
    // URL for anything else.
    expect(store.verifyUpload({ ...base, contentType: 'text/html' })).toBe(false);
    expect(store.verifyUpload({ ...base, signature: base.signature.slice(0, -1) + 'x' })).toBe(false);
    expect(store.verifyUpload({ ...base, now: new Date(NOW.getTime() + 601_000) })).toBe(false);
  });
});

describe('the R2 store', () => {
  const calls: { method: string; url: string; range: string | null; authorised: boolean }[] = [];

  const fakeFetch = (async (input: Parameters<typeof fetch>[0]) => {
    const request = input as Request;
    calls.push({
      method: request.method,
      url: request.url,
      range: request.headers.get('range'),
      authorised: (request.headers.get('authorization') ?? '').startsWith('AWS4-HMAC-SHA256'),
    });
    if (request.url.includes('missing')) return new Response(null, { status: 404 });
    if (request.method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers: { 'content-length': '2400000', 'content-type': 'image/jpeg' },
      });
    }
    if (request.method === 'GET') return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { status: 206 });
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  const store = r2MediaStore({
    accountId: 'acct',
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'secret',
    bucket: 'diyar-media',
    publicBaseUrl: 'https://media.diyar.example/',
    fetch: fakeFetch,
  });

  it('is a real provider', () => {
    expect(store.isStub).toBe(false);
  });

  it('presigns a PUT that carries a signature, an expiry and the content type', async () => {
    const upload = await store.presignUpload({ key: KEY, contentType: 'image/jpeg', expiresInSeconds: 600, now: NOW });
    const url = new URL(upload.url);

    expect(url.host).toBe('acct.r2.cloudflarestorage.com');
    expect(url.pathname).toBe(`/diyar-media/${KEY}`);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    // The content type is INSIDE the signature, so this URL cannot be used to
    // store the same key as `text/html`.
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
    expect(upload.headers).toEqual({ 'content-type': 'image/jpeg' });
    expect(upload.expiresAt.toISOString()).toBe('2026-09-15T12:10:00.000Z');
  });

  it('reads size with a signed HEAD, and the header with a signed ranged GET', async () => {
    calls.length = 0;
    expect(await store.describe(KEY)).toEqual({ byteSize: 2_400_000, contentType: 'image/jpeg' });
    expect(await store.readHeader(KEY, 4)).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));

    expect(calls.map((c) => c.method)).toEqual(['HEAD', 'GET']);
    expect(calls[1]!.range).toBe('bytes=0-3');
    expect(calls.every((c) => c.authorised)).toBe(true);
  });

  it('reads a missing object as absent, not as an error', async () => {
    const missing = `products/missing/${'ab'.repeat(12)}.jpg`;
    expect(await store.describe(missing)).toBeNull();
    expect(await store.readHeader(missing, 4)).toBeNull();
  });

  it('serves from the public origin, without a doubled slash', () => {
    expect(store.publicUrl(KEY)).toBe(`https://media.diyar.example/${KEY}`);
  });
});
