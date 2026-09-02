import { describe, expect, it } from 'vitest';
import { Address, GOVERNORATES } from './address';
import { InvalidMoney } from '../errors/index';

const valid = {
  governorate: 'cairo' as const,
  city: 'مدينة نصر',
  area: 'الحي السابع',
  street: 'شارع عباس العقاد',
  building: '14',
};

describe('Address — Egyptian addressing, no postal codes', () => {
  it('builds from governorate → city → area → street → building', () => {
    const a = Address.create(valid);
    expect(a.governorate).toBe('cairo');
    expect(a.city).toBe('مدينة نصر');
    expect(a.building).toBe('14');
  });

  it('has no postal code field at all', () => {
    const a = Address.create(valid);
    expect('postalCode' in a.toJSON()).toBe(false);
    expect('zip' in a.toJSON()).toBe(false);
  });

  it('covers all 27 governorates, matching the database enum', () => {
    expect(GOVERNORATES).toHaveLength(27);
    for (const g of GOVERNORATES) {
      expect(Address.create({ ...valid, governorate: g }).governorate).toBe(g);
    }
  });

  it('refuses an unknown governorate rather than storing free text', () => {
    expect(() =>
      Address.create({ ...valid, governorate: 'atlantis' as unknown as 'cairo' }),
    ).toThrow(InvalidMoney);
  });
});

describe('Address — required parts', () => {
  it('names every missing part at once', () => {
    try {
      Address.create({ ...valid, city: '', area: '', street: '  ', building: '' });
      throw new Error('should have thrown');
    } catch (e) {
      const msg = (e as Error).message;
      for (const part of ['city', 'area', 'street', 'building']) {
        expect(msg).toContain(part);
      }
    }
  });

  it('treats whitespace-only as missing', () => {
    expect(() => Address.create({ ...valid, building: '   ' })).toThrow(/building/);
  });

  it('trims what it keeps', () => {
    const a = Address.create({ ...valid, city: '  مدينة نصر  ' });
    expect(a.city).toBe('مدينة نصر');
  });
});

describe('Address — the landmark, which is a cost control', () => {
  it('is optional', () => {
    expect(Address.create(valid).hasLandmark).toBe(false);
  });

  it('is reported when present, so checkout can nudge for one', () => {
    // Doc 03 §4 makes failed delivery the largest single cost line. A landmark
    // is what lets a courier arrive without phoning.
    const a = Address.create({ ...valid, landmark: 'أمام مسجد الرحمن' });
    expect(a.hasLandmark).toBe(true);
    expect(a.landmark).toBe('أمام مسجد الرحمن');
  });

  it('an empty landmark counts as absent, not as a blank string', () => {
    expect(Address.create({ ...valid, landmark: '   ' }).hasLandmark).toBe(false);
  });
});

describe('Address — immutability', () => {
  it('cannot be mutated after construction', () => {
    const a = Address.create(valid);
    expect(() => {
      (a as unknown as { fields: unknown }).fields = {};
    }).toThrow();
    expect(a.city).toBe('مدينة نصر');
  });

  it('its serialised form is frozen too', () => {
    const json = Address.create(valid).toJSON();
    expect(Object.isFrozen(json)).toBe(true);
  });
});
