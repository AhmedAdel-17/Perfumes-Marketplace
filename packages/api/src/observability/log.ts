/**
 * Structured logs — one JSON object per line, scrubbed before it is written.
 *
 * WHY THIS EXISTS (task P1.4.3, docs/architecture/09 §1–2). The whole of this
 * system's observability was two `console.error` calls. A pilot run that way is
 * blind: when a house says "my order vanished", there is no line anywhere that
 * says which request, which order, what happened.
 *
 * PATTERN: a thin function, not a framework (09 §2 says so, and CLAUDE.md §13
 * says no dependency without a reason). A logger is `(level, event, fields) →
 * one line`. Everything a framework adds — transports, rotation, batching — is
 * the platform's job on this stack: stdout goes to the host's log drain.
 *
 * THE SCRUBBER IS THE POINT. A log line outlives the request by thirty days,
 * gets copied into a vendor's storage, and is read by whoever is on call. So
 * the rules from 09 §2 are applied here, to every line, rather than remembered
 * at every call site:
 *
 *   · a PHONE never appears in full. It is the primary customer identifier in
 *     this product (CLAUDE.md §16), which is exactly why it must not be the
 *     thing a leaked log is searchable by. It is masked to its last two digits
 *     — enough for support to say "the number ending 67", not enough to call it;
 *   · a ONE-TIME CODE, a cookie, a token or a secret never appears at all;
 *   · an ADDRESS below the city never appears;
 *   · and a phone number EMBEDDED in a string — an error message, a note — is
 *     masked too, because the dangerous leak is the one nobody thought was a
 *     field.
 *
 * WHY MASK RATHER THAN HASH, when 09 §1 says "hash it". A plain hash of an
 * Egyptian mobile number is reversible: there are only about four hundred
 * million of them, and hashing all of them takes seconds. A keyed hash would
 * need a secret in every log shipper. The mask keeps the only property support
 * actually uses — "is this the same customer who rang" is answered by the order
 * reference on the same line.
 */

export type LogLevel = 'info' | 'warn' | 'error';

/** Where a finished line goes. Injected, so a test can read what was written. */
export type LogSink = (line: string, level: LogLevel) => void;

/** stdout for info and warn, stderr for errors — what a log drain expects. */
export const stdoutSink: LogSink = (line, level) => {
  // The one place writing to the console IS the feature.
  // eslint-disable-next-line no-console
  (level === 'error' ? console.error : console.log)(line);
};

export interface Logger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
  /** A logger that adds these fields to every line — a request id, an order ref. */
  child(fields: Record<string, unknown>): Logger;
}

/* ------------------------------------------------------------ the rules */

/** Keys whose value must never be written, in any form. */
const NEVER = /^(otp|one_?time_?code|login_?code|password|passcode|secret|token|access_?token|refresh_?token|authorization|cookie|cookies|set_?cookie|session_?secret)$/i;

/** Keys that hold a phone number. Masked, not dropped: the last two digits are useful. */
const PHONE_KEY = /phone|mobile|msisdn/i;

/** Keys that hold an address below the city. */
const ADDRESS_KEY = /^(address|street|building|apartment|floor|landmark|address_?line\d?)$/i;

/**
 * An Egyptian mobile number anywhere inside a string: `01` + one of 0/1/2/5 +
 * eight digits, optionally written with `+20` or `20` in front.
 */
const PHONE_IN_TEXT = /(?:\+?20)?0?1[0125]\d{8}/g;

/** A six-digit value under the key `code` is a one-time code, not an error code. */
const looksLikeOtp = (key: string, value: unknown) =>
  /^code$/i.test(key) && typeof value === 'string' && /^\d{6}$/.test(value.trim());

export const maskPhone = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 2 ? `•••${digits.slice(-2)}` : '•••';
};

const maskPhonesInText = (text: string): string => text.replace(PHONE_IN_TEXT, maskPhone);

/**
 * Apply the rules to one value, recursively and with a depth bound — a cycle in
 * an error's `cause` chain must not hang the request that is trying to report it.
 */
export function scrub(value: unknown, key = '', depth = 0): unknown {
  if (depth > 6) return '[depth]';
  if (key && NEVER.test(key)) return undefined;
  if (key && looksLikeOtp(key, value)) return undefined;
  if (key && ADDRESS_KEY.test(key)) return value == null ? value : '[redacted]';

  if (typeof value === 'string') {
    return key && PHONE_KEY.test(key) ? maskPhone(value) : maskPhonesInText(value);
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: maskPhonesInText(value.message),
      ...(value.cause !== undefined ? { cause: scrub(value.cause, 'cause', depth + 1) } : {}),
    };
  }
  if (Array.isArray(value)) return value.map((v) => scrub(v, '', depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const cleaned = scrub(v, k, depth + 1);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return out;
  }
  return value;
}

/* ------------------------------------------------------------ the logger */

export function createLogger(
  base: Record<string, unknown> = {},
  sink: LogSink = stdoutSink,
  now: () => Date = () => new Date(),
): Logger {
  const write = (level: LogLevel, event: string, fields: Record<string, unknown> = {}) => {
    const line = scrub({ ts: now().toISOString(), level, event, ...base, ...fields });
    sink(JSON.stringify(line), level);
  };
  return {
    info: (event, fields) => write('info', event, fields),
    warn: (event, fields) => write('warn', event, fields),
    error: (event, fields) => write('error', event, fields),
    child: (fields) => createLogger({ ...base, ...fields }, sink, now),
  };
}
