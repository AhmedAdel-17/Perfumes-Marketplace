import { describe, expect, it, vi } from 'vitest';
import {
  assertProductionSafe,
  describeProviders,
  StubInProductionError,
  type OtpSender,
  type PaymentGateway,
  type Providers,
} from './ports';
import { cashOnDelivery, consoleOtpSender } from './stubs';

const realOtp: OtpSender = { name: 'vodafone-sms', isStub: false, async send() {} };

const realCards: PaymentGateway = {
  name: 'paymob',
  isStub: false,
  methods: ['cod', 'card', 'wallet'],
  async authorise() {
    return { authorised: true, redirectUrl: 'https://example.test/pay', providerReference: 'x' };
  },
};

describe('the production guard — a stub must not be able to run for real', () => {
  it('refuses to start production while holding a stub', () => {
    const providers: Providers = { otp: consoleOtpSender, payments: cashOnDelivery };
    expect(() => assertProductionSafe(providers, 'production')).toThrow(StubInProductionError);
  });

  it('names every stub, not just the first', () => {
    // Finding these one deploy at a time is how a release takes four attempts.
    const bothStubbed: Providers = {
      otp: consoleOtpSender,
      payments: { name: 'fake-paymob', isStub: true, methods: ['card'], async authorise() {
        return { authorised: true, redirectUrl: null, providerReference: null };
      } },
    };
    try {
      assertProductionSafe(bothStubbed, 'production');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(StubInProductionError);
      expect((error as StubInProductionError).stubs).toEqual(['console-otp', 'fake-paymob']);
      expect((error as Error).message).toContain('console-otp');
      expect((error as Error).message).toContain('fake-paymob');
    }
  });

  it('allows stubs everywhere that is not production', () => {
    const providers: Providers = { otp: consoleOtpSender, payments: cashOnDelivery };
    for (const env of ['development', 'test', 'staging', undefined]) {
      expect(() => assertProductionSafe(providers, env), String(env)).not.toThrow();
    }
  });

  it('lets a fully real configuration start in production', () => {
    expect(() =>
      assertProductionSafe({ otp: realOtp, payments: realCards }, 'production'),
    ).not.toThrow();
  });

  it('reads isStub from the ADAPTER, never from the environment', () => {
    // The environment is the thing that gets misconfigured. If `isStub` were
    // derived from NODE_ENV, a mis-set variable would silently arm the fake —
    // which is the exact failure this guard exists to make impossible.
    const providers: Providers = { otp: consoleOtpSender, payments: cashOnDelivery };
    expect(providers.otp.isStub).toBe(true);
    expect(assertProductionSafe(providers, 'development')).toBeUndefined();
    expect(() => assertProductionSafe(providers, 'production')).toThrow();
  });
});

describe('cash on delivery is not a stub', () => {
  it('declares itself real, because it depends on nobody', () => {
    // The launch payment method needs no contract, no gateway and no approval.
    // That is why deferring the card integration costs so little.
    expect(cashOnDelivery.isStub).toBe(false);
    expect(() => assertProductionSafe(
      { otp: realOtp, payments: cashOnDelivery }, 'production',
    )).not.toThrow();
  });

  it('authorises a COD intent without capturing anything', async () => {
    const result = await cashOnDelivery.authorise({
      reference: 'DY-1', amountPiastres: 45_000, method: 'cod',
    });
    expect(result.authorised).toBe(true);
    // No redirect and no provider reference: nothing was taken. The money
    // exists when the courier remits, which settlement already enforces.
    expect(result.redirectUrl).toBeNull();
    expect(result.providerReference).toBeNull();
  });

  it('refuses a method it cannot process rather than pretending', async () => {
    await expect(cashOnDelivery.authorise({
      reference: 'DY-2', amountPiastres: 45_000, method: 'card',
    })).rejects.toThrow(/cannot process/);
    expect(cashOnDelivery.methods).toEqual(['cod']);
  });
});

describe('the OTP stub', () => {
  it('sends a real code rather than accepting a fixed one', async () => {
    // Development must exercise the SAME verification path as production —
    // entering a wrong code has to fail here too, or that branch runs for the
    // first time in front of a customer.
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await consoleOtpSender.send({ phone: '01001234567', code: '482913' });
    expect(log).toHaveBeenCalledOnce();
    expect(String(log.mock.calls[0]![0])).toContain('482913');
    log.mockRestore();
  });
});

describe('describeProviders', () => {
  it('marks the stubs, so a running configuration is never a guess', () => {
    const line = describeProviders({ otp: consoleOtpSender, payments: cashOnDelivery });
    expect(line).toContain('otp=console-otp (STUB)');
    expect(line).toContain('payments=cash-on-delivery');
    expect(line).not.toContain('cash-on-delivery (STUB)');
  });
});
