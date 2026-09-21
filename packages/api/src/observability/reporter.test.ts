import { describe, expect, it } from 'vitest';
import { assertProductionSafe, StubInProductionError } from '../providers/ports';
import { cashOnDelivery, consoleOtpSender, logErrorReporter } from '../providers/stubs';

/**
 * The error reporter this system ships with until Sentry exists (P1.4.3).
 *
 * Two properties, and the second is the one that matters: it writes a line
 * worth reading, and it is refused in production — because error reporting
 * that goes only to one container's stdout is error reporting nobody receives.
 */
describe('the log error reporter', () => {
  it('writes one scrubbed error line with the request id and the procedure', () => {
    const lines: string[] = [];
    logErrorReporter((line) => lines.push(line)).capture(
      new Error('no stock for 01001234567'),
      { requestId: 'aaaaaaaa-0000-4000-8000-000000000001', path: 'orders.place', fields: { order_ref: 'DY-CDFHJKMN' } },
    );

    const entry = JSON.parse(lines[0]!);
    expect(entry.level).toBe('error');
    expect(entry.event).toBe('error.unhandled');
    expect(entry.request_id).toBe('aaaaaaaa-0000-4000-8000-000000000001');
    expect(entry.path).toBe('orders.place');
    expect(entry.order_ref).toBe('DY-CDFHJKMN');
    expect(lines[0]).not.toContain('01001234567');
  });

  it('is REFUSED in production — a pilot with no error capture is blind', () => {
    const attempt = () => assertProductionSafe({
      otp: { ...consoleOtpSender, isStub: false },
      payments: { ...cashOnDelivery, isStub: false },
      errors: logErrorReporter(),
    }, 'production');

    expect(attempt).toThrow(StubInProductionError);
    expect(attempt).toThrow(/log-errors/);
  });

  it('and allowed everywhere else, where it is the whole point', () => {
    expect(() => assertProductionSafe({
      otp: consoleOtpSender, payments: cashOnDelivery, errors: logErrorReporter(),
    }, 'development')).not.toThrow();
  });
});
