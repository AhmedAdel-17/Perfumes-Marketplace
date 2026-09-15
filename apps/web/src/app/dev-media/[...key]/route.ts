import { assertMediaKey } from '@diyar/api';
import { MEDIA_LIMITS, sniffImage } from '@diyar/domain';
import { localStoreOrNull } from '@/core/media';

/**
 * The local media store's two HTTP halves — development only.
 *
 * With R2 configured this route does not exist in any meaningful sense: every
 * request is a 404, because `localStoreOrNull` returns null. And a production
 * process cannot hold the local store at all — `instrumentation.ts` refuses to
 * start with it. Two locks, so a development convenience cannot become an open
 * write endpoint on the public site.
 *
 * It behaves like R2 where that matters: an upload needs a signature this server
 * issued, for this key, for this type, before it expires; and nothing is SERVED
 * unless its own bytes say it is an image.
 */

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ key: string[] }> };

const notFound = () => new Response(null, { status: 404 });

async function keyFrom({ params }: Params): Promise<string | null> {
  const key = (await params).key.join('/');
  try {
    assertMediaKey(key);
    return key;
  } catch {
    return null;
  }
}

export async function GET(_request: Request, context: Params): Promise<Response> {
  const store = localStoreOrNull();
  const key = await keyFrom(context);
  if (!store || !key) return notFound();

  const bytes = await store.read(key);
  if (!bytes) return notFound();

  /*
   * The type comes from the file, never from its name.
   *
   * A file that is not an image is not served at all, rather than served as a
   * download: confirm already deletes such uploads, so one here means something
   * reached the directory another way, and the right response is nothing.
   */
  const facts = sniffImage(bytes.subarray(0, MEDIA_LIMITS.headerBytes));
  if (!facts) return notFound();

  // Copied into a buffer of its own: the bytes read from disk may view a shared
  // buffer, which a Response body may not be. A development route serving a few
  // megabytes at a time can afford the copy.
  const body = new Uint8Array(bytes.byteLength);
  body.set(bytes);

  return new Response(body, {
    headers: {
      'content-type': facts.type,
      // Keys are random and never reused, so a photograph at a key never changes.
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
}

export async function PUT(request: Request, context: Params): Promise<Response> {
  const store = localStoreOrNull();
  const key = await keyFrom(context);
  if (!store || !key) return notFound();

  const url = new URL(request.url);
  const contentType = url.searchParams.get('type') ?? '';
  const expires = Number(url.searchParams.get('expires'));
  const signature = url.searchParams.get('signature') ?? '';

  if (!store.verifyUpload({ key, contentType, expires, signature, now: new Date() })) {
    return new Response('upload URL is invalid or has expired', { status: 403 });
  }

  // The declared type is part of the signature; the header sent must be the one
  // the URL was issued for, as it must be for R2.
  if (request.headers.get('content-type') !== contentType) {
    return new Response('content-type does not match the upload URL', { status: 400 });
  }

  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength > MEDIA_LIMITS.maxBytes) {
    return new Response('file is larger than the limit', { status: 413 });
  }

  await store.write(key, body);
  return new Response(null, { status: 200 });
}
