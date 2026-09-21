import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, newNonce } from './security-headers';

/**
 * What each environment's Content-Security-Policy allows (task P3.4.3).
 *
 * The policy is a function precisely so these can be stated: production gets
 * no eval and no websocket, uploads to R2 are allowed exactly when R2 is
 * configured, and nothing frames the site in either environment.
 */
const directive = (policy: string, name: string) =>
  policy.split('; ').find((d) => d.startsWith(`${name} `)) ?? '';

const production = contentSecurityPolicy({
  nonce: 'bm9uY2U=', development: false,
  uploadOrigin: 'https://acct.r2.cloudflarestorage.com', mediaOrigin: 'https://media.example.eg',
});
const development = contentSecurityPolicy({
  nonce: 'bm9uY2U=', development: true, uploadOrigin: null, mediaOrigin: null,
});

describe('scripts run only if the server issued them', () => {
  it('allows the request’s nonce and strict-dynamic', () => {
    expect(directive(production, 'script-src')).toContain("'nonce-bm9uY2U='");
    expect(directive(production, 'script-src')).toContain("'strict-dynamic'");
  });

  it('never allows eval or inline scripts in production', () => {
    expect(directive(production, 'script-src')).not.toContain('unsafe-eval');
    expect(directive(production, 'script-src')).not.toContain('unsafe-inline');
  });

  it('allows eval in development only, for fast refresh', () => {
    expect(directive(development, 'script-src')).toContain("'unsafe-eval'");
  });

  it('refuses plugins outright', () => {
    expect(production).toContain("object-src 'none'");
  });
});

describe('nothing frames the site', () => {
  it.each([['production', production], ['development', development]])(
    'in %s', (_name, policy) => {
      expect(policy).toContain("frame-ancestors 'none'");
    },
  );
});

describe('uploads and media', () => {
  it('lets the browser PUT to R2 when R2 is configured', () => {
    // Without this, every photograph upload would be refused in production the
    // moment the policy is enforced.
    expect(directive(production, 'connect-src')).toContain('https://acct.r2.cloudflarestorage.com');
  });

  it('adds no upload origin when there is none, and no websocket outside development', () => {
    expect(directive(development, 'connect-src')).not.toContain('r2.cloudflarestorage');
    expect(directive(production, 'connect-src')).not.toContain('ws:');
    expect(directive(development, 'connect-src')).toContain('ws:');
  });

  it('allows the local blob preview a photo manager shows before upload', () => {
    expect(directive(production, 'img-src')).toContain('blob:');
  });

  it('upgrades insecure requests in production only', () => {
    expect(production).toContain('upgrade-insecure-requests');
    expect(development).not.toContain('upgrade-insecure-requests');
  });
});

describe('the nonce', () => {
  it('is fresh every time and at least 16 bytes of randomness', () => {
    const a = newNonce();
    const b = newNonce();
    expect(a).not.toBe(b);
    expect(atob(a).length).toBe(16);
  });
});
