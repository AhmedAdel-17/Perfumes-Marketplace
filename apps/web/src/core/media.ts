import 'server-only';
import { localMediaStore, r2MediaStore, type MediaStore } from '@diyar/api';

/**
 * Where this process stores photographs — the composition root for M-1.
 *
 * R2 when it is configured, the local disk when it is not. The choice is made
 * ONCE per process and cached, so the API context, the dev media route and the
 * startup guard all hold the very same store — a guard that inspected a
 * different instance from the one in use would pass for the wrong reason.
 *
 * THE LOCAL STORE IS A STUB, and `instrumentation.ts` refuses to start
 * production holding one. That is the guarantee; nothing here quietly picks
 * local disk in production.
 */

const R2_VARIABLES = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'R2_PUBLIC_BASE_URL',
] as const;

type LocalStore = ReturnType<typeof localMediaStore>;

declare global {
  // eslint-disable-next-line no-var
  var __diyarMediaStore: MediaStore | undefined;
}

function open(): MediaStore {
  const present = R2_VARIABLES.filter((name) => Boolean(process.env[name]));

  if (present.length === R2_VARIABLES.length) {
    return r2MediaStore({
      accountId: process.env.R2_ACCOUNT_ID!,
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      bucket: process.env.R2_BUCKET!,
      publicBaseUrl: process.env.R2_PUBLIC_BASE_URL!,
    });
  }

  /*
   * SOME of the R2 settings is a misconfiguration, not a choice.
   *
   * Falling back to local disk here would be the worst available outcome: a
   * deploy with four of five variables set would start, accept uploads onto one
   * container's disk, and lose them on the next restart — with every log line
   * saying it was working.
   */
  if (present.length > 0) {
    const missing = R2_VARIABLES.filter((name) => !process.env[name]);
    throw new Error(
      `Cloudflare R2 is partly configured — ${missing.join(', ')} not set. `
      + 'Set all five, or none for local development.',
    );
  }

  return localMediaStore({
    root: process.env.MEDIA_DIR ?? './.data/media',
    publicBaseUrl: `${process.env.APP_ORIGIN ?? 'http://localhost:3100'}/dev-media`,
    // A development signing key, like the session modules' development
    // fallbacks. The store itself is refused in production, key and all.
    secret: process.env.MEDIA_DEV_SECRET ?? 'development-only-not-a-secret-media',
  });
}

/** This process's photograph store. */
export const mediaStore = (): MediaStore => (globalThis.__diyarMediaStore ??= open());

/**
 * The local store, for the development upload and serving route — or null when
 * this process is using R2, in which case that route must not exist at all.
 */
export const localStoreOrNull = (): LocalStore | null => {
  const store = mediaStore();
  return store.isStub ? (store as LocalStore) : null;
};
