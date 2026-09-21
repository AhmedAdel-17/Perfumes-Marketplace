/**
 * The Content-Security-Policy, as a pure function (task P3.4.3, docs/architecture/05 §9).
 *
 * WHAT IT IS FOR. A storefront that renders sellers' product names, reviews and
 * editorial pages is a page that renders other people's text. If any of it ever
 * reached the DOM as markup, a CSP is what stops it running. So scripts run
 * only if the server issued them — a per-request nonce — and nothing may frame
 * the site, because the console that releases money is one clickjacking page
 * away from being clicked by the wrong hand.
 *
 * WHY A FUNCTION AND NOT A STRING IN `next.config`. The nonce changes on every
 * request, the upload origin depends on which bucket this deployment uses, and
 * development needs one relaxation production must never have. A function
 * makes all three arguments visible and lets a test state exactly what each
 * environment gets.
 *
 * WHY THE NONCE WORKS HERE, checked rather than hoped: a nonce can only be
 * stamped on a page rendered per request. `next build` on 22 Sep 2026 lists every
 * route as dynamic (only the icon is static), so there is no prerendered page
 * whose scripts would be refused for lacking one.
 *
 * Edge-safe: this runs in middleware, so it imports nothing at all.
 */

export interface CspInput {
  /** A fresh base64 value per request. */
  readonly nonce: string;
  /**
   * Development only. React's fast refresh evaluates code, so dev needs
   * `'unsafe-eval'` and a websocket for hot reload. Production gets neither.
   */
  readonly development: boolean;
  /**
   * Where the browser PUTs a photograph directly (a presigned R2 URL), when R2
   * is configured. Without it in `connect-src`, every upload in production
   * would be refused by the policy the moment it was enforced.
   */
  readonly uploadOrigin: string | null;
  /** The public media origin, for any image served from the bucket directly. */
  readonly mediaOrigin: string | null;
}

export function contentSecurityPolicy(input: CspInput): string {
  const { nonce, development, uploadOrigin, mediaOrigin } = input;
  const extra = (value: string | null) => (value ? ` ${value}` : '');

  const directives = [
    "default-src 'self'",
    /*
     * `'strict-dynamic'` means a nonced script may load the scripts it needs —
     * which is how Next's own chunks arrive — while any script the page did not
     * start is refused. `'self'` stays as the fallback for browsers that predate
     * strict-dynamic and ignore it.
     */
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    /*
     * `'unsafe-inline'` for styles, and it is a known, accepted cost: Next and
     * the font loader write inline `style` attributes and tags, and a style
     * cannot execute. The protection that matters here is on scripts.
     */
    "style-src 'self' 'unsafe-inline'",
    // `blob:` is the photo manager's local preview of a file before upload.
    `img-src 'self' data: blob:${extra(mediaOrigin)}`,
    // next/font self-hosts every face; nothing is fetched from Google at runtime.
    "font-src 'self' data:",
    `connect-src 'self'${extra(uploadOrigin)}${development ? ' ws: wss:' : ''}`,
    // Nobody frames this site. The console releases money.
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];
  if (!development) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

/** 16 random bytes, base64 — the size the CSP specification recommends as a minimum. */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
