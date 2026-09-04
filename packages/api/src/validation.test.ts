/**
 * The validation boundary, tested as an attacker would probe it.
 *
 * These exist because the phone regex was written `[0-2,5]` — which reads as
 * "0 to 2, or 5" and means "0, 1, 2, comma, or 5". `01,12345678` passed. On a
 * marketplace where the phone IS the identity, that is a corrupt identity
 * accepted at the front door, and no test asked the question because every test
 * fed it plausible numbers.
 *
 * So the rule here is: for each field, assert what it accepts AND assert the
 * nearest things it must not.
 */
import { describe, expect, it } from 'vitest';
import { REJECTION_REASONS } from '@diyar/domain';
import {
  addressSchema, cartLineSchema, declineSchema, phoneSchema,
  placeOrderSchema, rejectionReasons, slugSchema,
} from './validation';

const address = {
  governorate: 'cairo',
  city: 'المهندسين',
  area: 'الدقي',
  street: 'شارع البهراء',
  building: '21',
} as const;

describe('phoneSchema', () => {
  it.each([
    ['01012345678', 'Vodafone'],
    ['01112345678', 'Etisalat'],
    ['01212345678', 'Orange'],
    ['01512345678', 'WE'],
    ['+201012345678', 'international form'],
    ['  01012345678  ', 'surrounded by whitespace a keyboard adds'],
  ])('accepts %s (%s)', (input) => {
    expect(phoneSchema.safeParse(input).success).toBe(true);
  });

  it.each([
    ['01,12345678', 'a comma where the operator digit belongs'],
    ['01.12345678', 'a full stop in the same position'],
    ['01312345678', 'operator 3, which Egypt does not issue'],
    ['01412345678', 'operator 4, likewise'],
    ['01612345678', 'operator 6, likewise'],
    ['0101234567', 'one digit short'],
    ['010123456789', 'one digit long'],
    ['+2001012345678', 'a malformed country code'],
    ['00201012345678', 'the dialling prefix rather than +'],
    ['٠١٠١٢٣٤٥٦٧٨', 'Arabic-Indic digits'],
    ['', 'nothing at all'],
    ['01012345678\n01099999999', 'two numbers, one per line'],
    ['<script>alert(1)</script>', 'markup'],
  ])('refuses %s (%s)', (input) => {
    expect(phoneSchema.safeParse(input).success).toBe(false);
  });

  /**
   * Arabic-Indic digits are REFUSED rather than converted, and that is a
   * decision rather than an oversight.
   *
   * An Egyptian keyboard produces them, so a customer can type ٠١٠… in good
   * faith. But this schema is the identity boundary: if it silently converted,
   * the same person could exist as two customers depending on which keyboard
   * they used, and the tracking page would refuse the order they just placed.
   *
   * Normalisation belongs at the INPUT — one place, visible to the person
   * typing, where the field shows what it understood. Doing it here would hide
   * the conversion inside a schema that also decides identity.
   */
  it('refuses Arabic-Indic digits at the identity boundary', () => {
    expect(phoneSchema.safeParse('٠١٠١٢٣٤٥٦٧٨').success).toBe(false);
  });
});

describe('the decline vocabulary', () => {
  it('is the domain vocabulary, not a copy of it', () => {
    expect(rejectionReasons).toBe(REJECTION_REASONS);
  });

  it('accepts every reason the domain defines', () => {
    for (const reason of REJECTION_REASONS) {
      const result = declineSchema.safeParse({
        subOrderId: '00000000-0000-4000-8000-000000000000', reason,
      });
      expect(result.success, `the domain defines ${reason} and the schema refused it`).toBe(true);
    }
  });

  it('refuses a reason that is merely plausible', () => {
    // The exact code the seller portal used to send.
    expect(declineSchema.safeParse({
      subOrderId: '00000000-0000-4000-8000-000000000000', reason: 'cannot_fulfil_sla',
    }).success).toBe(false);
  });

  it('refuses free text alongside a valid code', () => {
    expect(declineSchema.safeParse({
      subOrderId: '00000000-0000-4000-8000-000000000000',
      reason: 'out_of_stock',
      unexpected: 'anything',
    }).success).toBe(false);
  });
});

describe('cartLineSchema', () => {
  const id = '00000000-0000-4000-8000-000000000000';

  it.each([0, -1, 1.5, 100, Number.NaN, Number.POSITIVE_INFINITY, 1e9])(
    'refuses a quantity of %s', (quantity) => {
      expect(cartLineSchema.safeParse({ productId: id, quantity }).success).toBe(false);
    },
  );

  it('accepts one, and ninety-nine', () => {
    expect(cartLineSchema.safeParse({ productId: id, quantity: 1 }).success).toBe(true);
    expect(cartLineSchema.safeParse({ productId: id, quantity: 99 }).success).toBe(true);
  });

  it('refuses a product id that is not a uuid', () => {
    expect(cartLineSchema.safeParse({ productId: 'nur-layl-50', quantity: 1 }).success).toBe(false);
  });

  it('refuses a price sent by the browser', () => {
    // The browser may state what it SAW; it may never state what to charge.
    // A schema that silently ignored the extra key would let a future
    // refactor start reading it.
    expect(cartLineSchema.safeParse({
      productId: id, quantity: 1, pricePiastres: 1,
    }).success).toBe(false);
  });
});

describe('placeOrderSchema', () => {
  const line = { productId: '00000000-0000-4000-8000-000000000000', quantity: 1 };
  const valid = {
    contactName: 'مروة خليل',
    contactPhone: '01012345678',
    address,
    lines: [line],
    paymentMethod: 'cod',
  } as const;

  it('accepts a well-formed order', () => {
    expect(placeOrderSchema.safeParse(valid).success).toBe(true);
  });

  it('refuses an empty bag', () => {
    expect(placeOrderSchema.safeParse({ ...valid, lines: [] }).success).toBe(false);
  });

  it('refuses a bag larger than any real order', () => {
    expect(placeOrderSchema.safeParse({
      ...valid, lines: Array.from({ length: 51 }, () => line),
    }).success).toBe(false);
  });

  it('refuses a name that is only whitespace', () => {
    expect(placeOrderSchema.safeParse({ ...valid, contactName: '   ' }).success).toBe(false);
  });

  it('refuses a name longer than any name', () => {
    expect(placeOrderSchema.safeParse({
      ...valid, contactName: 'م'.repeat(201),
    }).success).toBe(false);
  });

  it('stores markup as the text it is, rather than refusing it', () => {
    // React escapes on render, so a name containing angle brackets is safe to
    // keep. Refusing it would lock out anyone whose name legitimately contains
    // punctuation, and would teach nobody anything: the escaping is what
    // protects the page, not the filter.
    const result = placeOrderSchema.safeParse({
      ...valid, contactName: '<img src=x onerror=alert(1)>',
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.contactName).toBe('<img src=x onerror=alert(1)>');
  });

  it('refuses an unknown payment method', () => {
    expect(placeOrderSchema.safeParse({ ...valid, paymentMethod: 'crypto' }).success).toBe(false);
  });

  it('refuses a governorate that is not one', () => {
    expect(placeOrderSchema.safeParse({
      ...valid, address: { ...address, governorate: 'paris' },
    }).success).toBe(false);
  });

  it('refuses an address carrying a postal code', () => {
    // Egypt does not use them. A field arriving means the caller is following
    // some other country's shape, and accepting it would let that shape spread.
    expect(placeOrderSchema.safeParse({
      ...valid, address: { ...address, postalCode: '11311' },
    }).success).toBe(false);
  });

  it('refuses extra top-level keys', () => {
    expect(placeOrderSchema.safeParse({
      ...valid, totalPiastres: 1, sellerId: 'x',
    }).success).toBe(false);
  });
});

describe('slugSchema', () => {
  it.each(['nur-layl-50', 'a', 'a-1'])('accepts %s', (input) => {
    expect(slugSchema.safeParse(input).success).toBe(true);
  });

  it.each([
    '../../etc/passwd',
    'nur layl',
    'NUR-LAYL',
    'nur_layl',
    'نور-الليل',
    "'; DROP TABLE products; --",
    '%2e%2e%2f',
  ])('refuses %s', (input) => {
    expect(slugSchema.safeParse(input).success).toBe(false);
  });
});

describe('addressSchema', () => {
  it('accepts the optional parts being absent', () => {
    expect(addressSchema.safeParse(address).success).toBe(true);
  });

  it('accepts floor, apartment and landmark when given', () => {
    expect(addressSchema.safeParse({
      ...address, floor: '3', apartment: '12', landmark: 'أمام الصيدلية',
    }).success).toBe(true);
  });

  it.each(['city', 'area', 'street', 'building'])('requires %s', (field) => {
    expect(addressSchema.safeParse({ ...address, [field]: '  ' }).success).toBe(false);
  });
});
