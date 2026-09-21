import { NextResponse, type NextRequest } from 'next/server';
import { contentSecurityPolicy, newNonce } from './core/security-headers';

/**
 * Read once, at module load, because they are deployment facts: the bucket a
 * build talks to does not change between requests.
 */
const UPLOAD_ORIGIN = process.env.R2_ACCOUNT_ID
  ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  : null;
const MEDIA_ORIGIN = process.env.R2_PUBLIC_BASE_URL
  ? new URL(process.env.R2_PUBLIC_BASE_URL).origin
  : null;

/**
 * Every request gets a name (task P1.4.3, docs/architecture/09 §1).
 *
 * A UUID, generated HERE — never taken from the client. An `x-request-id` a
 * browser sent would be an attacker's choice of what their errors are filed
 * under, and a way to write arbitrary text into every log line. So any inbound
 * value is overwritten.
 *
 * It travels two ways. Forward, as a request header, so the API's composition
 * root can read it and stamp it on every log line, audit entry and error of this
 * request. And back, as a response header, so a support conversation that
 * starts with "it said حدث خطأ" can end with the id the server already filed it
 * under — the same id printed inside that Arabic message.
 *
 * Static assets are excluded: an image has no request worth correlating, and
 * middleware on every thumbnail is latency on exactly the connections this
 * product is built for.
 */
export function middleware(request: NextRequest) {
  const id = crypto.randomUUID();

  /*
   * The Content-Security-Policy, with a nonce minted for this request only
   * (P3.4.3). It goes on the FORWARDED request as well as the response: Next
   * reads the nonce from the request's policy header and stamps it on its own
   * scripts, and the root layout reads `x-nonce` for the one inline script this
   * app writes itself (the theme). A script without it does not run.
   */
  const nonce = newNonce();
  const policy = contentSecurityPolicy({
    nonce,
    development: process.env.NODE_ENV !== 'production',
    uploadOrigin: UPLOAD_ORIGIN,
    mediaOrigin: MEDIA_ORIGIN,
  });

  const headers = new Headers(request.headers);
  headers.set('x-request-id', id);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', policy);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set('x-request-id', id);
  response.headers.set('content-security-policy', policy);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|dev-media|favicon\.ico|icon\.svg).*)'],
};
