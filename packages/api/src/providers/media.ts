/**
 * Where photographs are stored.
 *
 * Pattern — Ports & Adapters, with the production guard every external provider
 * carries (see ports.ts). Founder decision M-1: Cloudflare R2.
 *
 * THE SHAPE OF AN UPLOAD, and why it is not a form post:
 *
 *   1. the server decides the key and signs a short-lived PUT URL;
 *   2. the browser sends the file straight to storage — a 6 MB photograph never
 *      passes through this application's server or its request limits;
 *   3. the server reads what ARRIVED — its size, and the first bytes of the file
 *      itself — and only then writes a `product_media` row.
 *
 * Step 3 is the one that matters. Nothing in step 2 can be trusted: the browser
 * chose the bytes. The size limit is enforced there too rather than signed into
 * the URL, because browsers do not let a script set `Content-Length`, so a
 * signature over it would break every real upload while stopping nobody.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, sep } from 'node:path';
import { AwsClient } from 'aws4fetch';
import type { ExternalProvider } from './ports';

export interface PresignedUpload {
  readonly url: string;
  readonly method: 'PUT';
  /** Headers the browser MUST send, exactly — they are part of the signature. */
  readonly headers: Readonly<Record<string, string>>;
  readonly expiresAt: Date;
}

export interface StoredObject {
  readonly byteSize: number;
  /**
   * The type storage will SERVE the object with, where the store records one.
   *
   * Compared with the type read from the file's own header before a row is
   * written: a JPEG stored under `text/html` is served as a web page, whatever
   * its bytes are. Null for a store that decides the served type itself.
   */
  readonly contentType: string | null;
}

export interface MediaStore extends ExternalProvider {
  presignUpload(input: {
    readonly key: string;
    readonly contentType: string;
    readonly expiresInSeconds: number;
    readonly now: Date;
  }): Promise<PresignedUpload>;

  /** Null when nothing is stored at that key — never an exception for "not there". */
  describe(key: string): Promise<StoredObject | null>;

  /** The first `length` bytes, for reading the file's own header. Null when absent. */
  readHeader(key: string, length: number): Promise<Uint8Array | null>;

  /** Idempotent: removing what is not there is not an error. */
  remove(key: string): Promise<void>;

  /** Where a visitor's browser fetches it. */
  publicUrl(key: string): string;
}

/**
 * A key is accepted only in the shape `productMediaKey` produces.
 *
 * Checked by every adapter, not only by the caller, because a key becomes a
 * filesystem path in one adapter and a URL path in the other, and `../` means
 * something in both.
 */
const KEY = /^[a-z]+\/[0-9a-z-]+\/[0-9a-f]{24}\.(?:jpg|png|webp)$/;

export function assertMediaKey(key: string): void {
  if (!KEY.test(key)) throw new Error(`Refusing a media key outside the expected shape: ${key}`);
}

/* ------------------------------------------------------------------------ R2 */

export interface R2Config {
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucket: string;
  /** The public origin photographs are served from, e.g. https://media.diyar.eg */
  readonly publicBaseUrl: string;
  /** Injected in tests, so no case needs the network. */
  readonly fetch?: typeof fetch;
}

export function r2MediaStore(config: R2Config): MediaStore {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    region: 'auto',
  });
  const doFetch = config.fetch ?? fetch;
  const objectUrl = (key: string) => {
    assertMediaKey(key);
    return `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}/${key}`;
  };
  const send = async (key: string, init: RequestInit) =>
    doFetch(await client.sign(objectUrl(key), init));

  return {
    name: 'cloudflare-r2',
    isStub: false,

    async presignUpload({ key, contentType, expiresInSeconds, now }) {
      const url = `${objectUrl(key)}?X-Amz-Expires=${expiresInSeconds}`;
      const signed = await client.sign(url, {
        method: 'PUT',
        headers: { 'content-type': contentType },
        aws: {
          signQuery: true,
          /*
           * `allHeaders` is what puts `content-type` INSIDE the signature.
           *
           * aws4fetch leaves it out by default, and without it a URL issued for
           * a JPEG accepts an upload declared as `text/html` — which R2 then
           * stores and serves as a web page from the media domain. The test for
           * this read `SignedHeaders=host` on its first run.
           */
          allHeaders: true,
          datetime: now.toISOString().replace(/[:-]|\.\d{3}/g, ''),
        },
      });
      return {
        url: signed.url,
        method: 'PUT',
        headers: { 'content-type': contentType },
        expiresAt: new Date(now.getTime() + expiresInSeconds * 1000),
      };
    },

    async describe(key) {
      const response = await send(key, { method: 'HEAD' });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`R2 HEAD ${key} failed: ${response.status}`);
      return {
        byteSize: Number(response.headers.get('content-length') ?? '0'),
        contentType: response.headers.get('content-type'),
      };
    },

    async readHeader(key, length) {
      const response = await send(key, { method: 'GET', headers: { range: `bytes=0-${length - 1}` } });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`R2 GET ${key} failed: ${response.status}`);
      return new Uint8Array(await response.arrayBuffer()).subarray(0, length);
    },

    async remove(key) {
      const response = await send(key, { method: 'DELETE' });
      // R2, like S3, answers 204 for a key that was never there.
      if (!response.ok && response.status !== 404) {
        throw new Error(`R2 DELETE ${key} failed: ${response.status}`);
      }
    },

    publicUrl(key) {
      assertMediaKey(key);
      return `${config.publicBaseUrl.replace(/\/$/, '')}/${key}`;
    },
  };
}

/* --------------------------------------------------------------------- local */

export interface LocalMediaConfig {
  /** A directory on this machine. */
  readonly root: string;
  /** The origin + path the dev media route is mounted at, e.g. http://localhost:3100/dev-media */
  readonly publicBaseUrl: string;
  /** Signs upload URLs so the dev route cannot be used as an open write endpoint. */
  readonly secret: string;
}

const signUpload = (secret: string, key: string, contentType: string, expires: number) =>
  createHmac('sha256', secret).update(`${key}\n${contentType}\n${expires}`).digest('base64url');

/**
 * Photographs on this machine's disk — for development only.
 *
 * `isStub: true`, and not because it cannot store a file: it can. Because it
 * cannot serve one from more than one server, and a production deployment runs
 * several. Photographs uploaded to one instance would be missing on the others,
 * which is the kind of fault that looks random. `assertProductionSafe` refuses
 * to boot with it.
 *
 * Its upload URLs are SIGNED and expire, like R2's, so the development flow
 * exercises the same "the server issued this, and only for this key" path
 * production will.
 */
export function localMediaStore(config: LocalMediaConfig): MediaStore & {
  /** For the dev upload route: whether this PUT was issued by `presignUpload`. */
  verifyUpload(input: { key: string; contentType: string; expires: number; signature: string; now: Date }): boolean;
  /** For the dev upload route. */
  write(key: string, bytes: Uint8Array): Promise<void>;
  /** For the dev serving route. */
  read(key: string): Promise<Uint8Array | null>;
} {
  const pathFor = (key: string) => {
    assertMediaKey(key);
    const full = normalize(join(config.root, key));
    // Belt and braces: the key shape already forbids `..`.
    if (!full.startsWith(normalize(config.root) + sep)) throw new Error(`Media key escapes the root: ${key}`);
    return full;
  };

  const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';

  return {
    name: 'local-disk-media',
    isStub: true,

    async presignUpload({ key, contentType, expiresInSeconds, now }) {
      assertMediaKey(key);
      const expires = Math.floor(now.getTime() / 1000) + expiresInSeconds;
      const signature = signUpload(config.secret, key, contentType, expires);
      const query = new URLSearchParams({ type: contentType, expires: String(expires), signature });
      return {
        url: `${config.publicBaseUrl.replace(/\/$/, '')}/${key}?${query}`,
        method: 'PUT',
        headers: { 'content-type': contentType },
        expiresAt: new Date(expires * 1000),
      };
    },

    verifyUpload({ key, contentType, expires, signature, now }) {
      if (!KEY.test(key) || !Number.isFinite(expires)) return false;
      if (Math.floor(now.getTime() / 1000) > expires) return false;
      const expected = Buffer.from(signUpload(config.secret, key, contentType, expires));
      const actual = Buffer.from(signature);
      return expected.length === actual.length && timingSafeEqual(expected, actual);
    },

    async write(key, bytes) {
      const path = pathFor(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
    },

    async read(key) {
      try {
        return new Uint8Array(await readFile(pathFor(key)));
      } catch (error) {
        if (missing(error)) return null;
        throw error;
      }
    },

    async describe(key) {
      try {
        // The dev serving route sets the type from the file's own header, so
        // there is no stored type to compare against.
        return { byteSize: (await stat(pathFor(key))).size, contentType: null };
      } catch (error) {
        if (missing(error)) return null;
        throw error;
      }
    },

    async readHeader(key, length) {
      let handle;
      try {
        handle = await open(pathFor(key), 'r');
      } catch (error) {
        if (missing(error)) return null;
        throw error;
      }
      try {
        const buffer = new Uint8Array(length);
        const { bytesRead } = await handle.read(buffer, 0, length, 0);
        return buffer.subarray(0, bytesRead);
      } finally {
        await handle.close();
      }
    },

    async remove(key) {
      await rm(pathFor(key), { force: true });
    },

    publicUrl(key) {
      assertMediaKey(key);
      return `${config.publicBaseUrl.replace(/\/$/, '')}/${key}`;
    },
  };
}
