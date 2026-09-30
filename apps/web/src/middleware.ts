import { NextResponse, type NextRequest } from 'next/server';
import {
  isEnglishPath, isLocale, LOCALE_COOKIE, localePath, stripLocale, type Locale,
} from '@diyar/i18n/locale';
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

  const route = routeLanguage(request);
  if (route.kind === 'redirect') {
    const response = NextResponse.redirect(route.to);
    if (route.remember) rememberLocale(response, route.remember);
    response.headers.set('x-request-id', id);
    return response;
  }

  const headers = new Headers(request.headers);
  headers.set('x-request-id', id);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', policy);
  // Overwritten on every request, never read from the client: the language a
  // page renders in is decided by its URL, and only here.
  headers.set('x-locale', route.locale);
  headers.set('x-path', route.path);

  const response = route.rewrite
    ? NextResponse.rewrite(route.rewrite, { request: { headers } })
    : NextResponse.next({ request: { headers } });
  if (route.locale === 'en') rememberLocale(response, 'en');
  response.headers.set('x-request-id', id);
  response.headers.set('content-security-policy', policy);
  return response;
}

/**
 * Which language this request is in (P5.6.2).
 *
 * English lives under `/en` and is REWRITTEN onto the same routes Arabic uses,
 * so there is one page per screen rather than a copy per language; the page
 * learns its language from `x-locale`.
 *
 * The cookie remembers the last language a visitor chose or opened. A visitor
 * whose cookie says English and who follows an Arabic link — one the code has
 * not localised, or one somebody shared — is sent to the English URL, so a
 * missed link costs one redirect rather than a page in the wrong language.
 * `?lang=` is the explicit switch: it sets the cookie and lands on the clean URL.
 *
 * The seller portal and ops console are not translated yet, so they stay Arabic
 * whatever the cookie says; `/en/seller` goes to `/seller`.
 */
type LanguageRoute =
  | { kind: 'redirect'; to: URL; remember?: Locale }
  | { kind: 'serve'; locale: Locale; path: string; rewrite?: URL };

function routeLanguage(request: NextRequest): LanguageRoute {
  const url = request.nextUrl;
  const english = isEnglishPath(url.pathname);
  const bare = stripLocale(url.pathname);
  const localised = !UNTRANSLATED.some((prefix) => bare === prefix || bare.startsWith(`${prefix}/`));

  const asked = url.searchParams.get('lang');
  if (isLocale(asked)) {
    const to = url.clone();
    to.searchParams.delete('lang');
    to.pathname = localised ? localePath(asked, bare) : bare;
    return { kind: 'redirect', to, remember: asked };
  }

  if (english && !localised) {
    const to = url.clone();
    to.pathname = bare;
    return { kind: 'redirect', to };
  }

  const navigating = request.method === 'GET' || request.method === 'HEAD';
  if (!english && localised && navigating && request.cookies.get(LOCALE_COOKIE)?.value === 'en') {
    const to = url.clone();
    to.pathname = localePath('en', bare);
    return { kind: 'redirect', to };
  }

  const path = `${bare}${url.search}`;
  if (!english) return { kind: 'serve', locale: 'ar', path };
  const rewrite = url.clone();
  rewrite.pathname = bare;
  return { kind: 'serve', locale: 'en', path, rewrite };
}

const UNTRANSLATED = ['/seller', '/ops', '/api'];

function rememberLocale(response: NextResponse, locale: Locale) {
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax',
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|dev-media|favicon\.ico|icon\.svg).*)'],
};
