import { describe, expect, it } from 'vitest';
import { createLogger, maskPhone, scrub, type LogLevel } from './log';

/**
 * The log helper's PII rules (task P1.4.3 — the unit test the task names).
 *
 * A log line outlives the request by weeks, gets copied into a vendor's
 * storage, and is read by whoever is on call. Every rule here is one of
 * docs/architecture/09 §2's "never log" items, stated as something that fails.
 */
const capture = () => {
  const lines: Array<{ level: LogLevel; line: Record<string, unknown> }> = [];
  const log = createLogger({}, (line, level) => lines.push({ level, line: JSON.parse(line) }),
    () => new Date('2026-09-21T10:00:00Z'));
  return { log, lines };
};

describe('a log line is one JSON object with what support needs', () => {
  it('carries the timestamp, level, event and the fields given', () => {
    const { log, lines } = capture();
    log.info('orders.place', { order_ref: 'DY-ABCDEFGH', sub_orders: 2 });

    expect(lines[0]).toEqual({
      level: 'info',
      line: {
        ts: '2026-09-21T10:00:00.000Z', level: 'info', event: 'orders.place',
        order_ref: 'DY-ABCDEFGH', sub_orders: 2,
      },
    });
  });

  it('a child carries its fields on every line — the request id, set once', () => {
    const { log, lines } = capture();
    const request = log.child({ request_id: '5b6f2c1e-0000-4000-8000-000000000001' });
    request.info('a');
    request.warn('b');

    expect(lines.map((l) => l.line.request_id)).toEqual([
      '5b6f2c1e-0000-4000-8000-000000000001', '5b6f2c1e-0000-4000-8000-000000000001',
    ]);
  });

  it('routes errors by level, so the drain can tell them apart', () => {
    const { log, lines } = capture();
    log.error('boom');
    expect(lines[0]!.level).toBe('error');
  });
});

describe('a phone number never appears in full', () => {
  it('masks a phone field to its last two digits', () => {
    const { log, lines } = capture();
    log.info('x', { contactPhone: '01001234567', recipient_phone: '+201112223344' });

    expect(lines[0]!.line.contactPhone).toBe('•••67');
    expect(lines[0]!.line.recipient_phone).toBe('•••44');
  });

  it('masks a phone number EMBEDDED in a string — the leak nobody thought was a field', () => {
    // An error message that quotes the input is the classic way a number
    // reaches a log: nobody named the field, so nobody scrubbed it.
    const { log, lines } = capture();
    log.error('x', { message: 'no customer for 01001234567 on order DY-ABCDEFGH' });

    expect(lines[0]!.line.message).toBe('no customer for •••67 on order DY-ABCDEFGH');
    expect(JSON.stringify(lines[0])).not.toMatch(/01001234567/);
  });

  it('masks a phone inside an Error, and inside its cause', () => {
    const cause = new Error('upstream refused 01229998877');
    const error = new Error('placement failed for 01001234567', { cause });
    const out = JSON.stringify(scrub({ error }));

    expect(out).not.toMatch(/01001234567|01229998877/);
    expect(out).toMatch(/•••77/);
  });

  it('masks inside nested objects and arrays', () => {
    const out = JSON.stringify(scrub({ delivery: { recipients: [{ phone: '01001234567' }] } }));
    expect(out).not.toMatch(/01001234567/);
  });

  it('leaves an order reference and a request id alone — they look nothing like a phone', () => {
    const { log, lines } = capture();
    log.info('x', { order_ref: 'DY-CDFHJKMN', request_id: 'b2a1c3d4-0000-4000-8000-000000000123' });

    expect(lines[0]!.line.order_ref).toBe('DY-CDFHJKMN');
    expect(lines[0]!.line.request_id).toBe('b2a1c3d4-0000-4000-8000-000000000123');
  });

  it('maskPhone never returns more than the last two digits', () => {
    expect(maskPhone('01001234567')).toBe('•••67');
    expect(maskPhone('7')).toBe('•••');
  });
});

describe('secrets never appear at all', () => {
  it('drops a one-time code, a cookie, a token and a password', () => {
    const { log, lines } = capture();
    log.info('x', {
      otp: '123456', cookie: 'diyar_seller=abc.def', token: 'eyJ...', password: 'hunter2',
      authorization: 'Bearer x', kept: 'yes',
    });

    expect(lines[0]!.line).toEqual(expect.objectContaining({ kept: 'yes' }));
    for (const key of ['otp', 'cookie', 'token', 'password', 'authorization']) {
      expect(lines[0]!.line, key).not.toHaveProperty(key);
    }
  });

  it('drops a six-digit `code` — that is an OTP — but keeps an error code', () => {
    const { log, lines } = capture();
    log.info('a', { code: '482913' });
    log.error('b', { code: 'INTERNAL_SERVER_ERROR' });

    expect(lines[0]!.line).not.toHaveProperty('code');
    expect(lines[1]!.line.code).toBe('INTERNAL_SERVER_ERROR');
  });
});

describe('an address below the city never appears', () => {
  it('redacts street, building, apartment, floor and landmark, and keeps the city', () => {
    const out = scrub({
      city: 'القاهرة', governorate: 'cairo',
      street: 'شارع 9', building: '12', apartment: '4', floor: '3', landmark: 'بجوار الصيدلية',
    }) as Record<string, unknown>;

    expect(out.city).toBe('القاهرة');
    expect(out.governorate).toBe('cairo');
    for (const key of ['street', 'building', 'apartment', 'floor', 'landmark']) {
      expect(out[key], key).toBe('[redacted]');
    }
  });
});

describe('the scrubber cannot be hung', () => {
  it('stops at a depth bound instead of following a cycle forever', () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(() => JSON.stringify(scrub(a))).not.toThrow();
  });
});
