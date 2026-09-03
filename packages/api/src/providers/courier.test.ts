import { describe, expect, it } from 'vitest';
import { manualCourier, normaliseTrackingNumber, TRACKING_MAX } from './courier';
import { assertProductionSafe } from './ports';
import { consoleOtpSender } from './stubs';

describe('the manual courier is REAL, not a stub', () => {
  it('does not block a production launch', () => {
    // A house handing a parcel over and typing the airway bill is not a fake
    // version of shipping — it is shipping, and most Egyptian sellers work
    // exactly this way. Marking it a stub would block launch on a Bosta
    // contract for no reason.
    expect(manualCourier.isStub).toBe(false);
    expect(() => assertProductionSafe(
      { otp: { name: 'real', isStub: false, async send() {} },
        payments: { name: 'cod', isStub: false, methods: ['cod'], async authorise() {
          return { authorised: true, redirectUrl: null, providerReference: null };
        } },
        courier: manualCourier },
      'production',
    )).not.toThrow();
  });

  it('still refuses to boot production alongside something that IS fake', () => {
    expect(() => assertProductionSafe(
      { otp: consoleOtpSender, courier: manualCourier } as never, 'production',
    )).toThrow(/console-otp/);
  });

  it('says it cannot create a shipment rather than inventing a number', () => {
    // The honest failure mode. A fake adapter that returned a made-up tracking
    // number would look like it worked and strand a real parcel.
    expect(manualCourier.createsShipment).toBe(false);
  });
});

describe('tracking numbers, as a person types them', () => {
  it('strips the spaces and hyphens couriers print for readability', () => {
    expect(normaliseTrackingNumber('  bst-1234 5678 ')).toBe('BST12345678');
    expect(normaliseTrackingNumber('BST12345678')).toBe('BST12345678');
  });

  it('accepts formats we have not seen, because couriers differ', () => {
    // Rejecting a valid airway bill for not matching a guessed pattern strands
    // a parcel that has already physically left the building.
    for (const value of ['1234', 'EG998877665544', 'ABCD1234EFGH5678']) {
      expect(normaliseTrackingNumber(value), value).not.toBeNull();
    }
  });

  it('rejects what cannot be a tracking number at all', () => {
    expect(normaliseTrackingNumber('')).toBeNull();
    expect(normaliseTrackingNumber('12')).toBeNull();
    expect(normaliseTrackingNumber('A'.repeat(TRACKING_MAX + 1))).toBeNull();
    // Punctuation and anything non-alphanumeric.
    expect(normaliseTrackingNumber('BST/1234')).toBeNull();
    expect(normaliseTrackingNumber('عربي1234')).toBeNull();
  });

  it('is NOT the defence against SQL injection, and should not pretend to be', () => {
    // "drop table shipments" normalises to DROPTABLESHIPMENTS — eighteen
    // alphanumeric characters, indistinguishable from an airway bill, and
    // accepted. That is correct. Injection is stopped by parameterised
    // queries, and a format rule that appears to also stop it invites someone
    // to relax the format later and quietly remove a defence that was never
    // there. This function decides one thing: could a courier have printed it.
    expect(normaliseTrackingNumber('drop table shipments')).toBe('DROPTABLESHIPMENTS');
  });

  it('books a shipment with the normalised number', async () => {
    const record = await manualCourier.book({
      subOrderReference: 'DY-ABCD1234-A',
      trackingNumber: 'bst 1234-5678',
      codAmountPiastres: 50_500,
    });
    expect(record.trackingNumber).toBe('BST12345678');
    expect(record.labelUrl).toBeNull();
  });

  it('refuses to book an unusable number instead of storing rubbish', async () => {
    await expect(manualCourier.book({
      subOrderReference: 'DY-ABCD1234-A', trackingNumber: '!!', codAmountPiastres: 1,
    })).rejects.toThrow(/not a usable tracking number/);
  });
});
