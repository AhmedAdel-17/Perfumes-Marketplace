/**
 * Delivery address.
 *
 * Pattern — Value Object (ENGINEERING_PRINCIPLES §4). Validated once at
 * construction, so an `Address` that exists is a deliverable one.
 *
 * CLAUDE.md §16: governorate → city → area → street. **No postal codes** — Egypt
 * does not use them, and a field for one invites a courier integration to depend
 * on it.
 *
 * `landmark` is optional but load-bearing. Doc 03 §4 makes failed delivery the
 * largest single cost line in the model, and a landmark is what lets a courier
 * arrive without phoning. It is a cost control wearing a UX costume.
 *
 * Added because the database required these columns while the domain did not:
 * PlaceOrder would happily build an order that Postgres then refused. A rule
 * enforced on only one side of the boundary is a rule that will be broken.
 */
import { InvalidMoney } from '../errors/index';

/** Doc 07 has no canonical list; this mirrors the governorate enum in 0000. */
export const GOVERNORATES = [
  'cairo', 'giza', 'alexandria', 'qalyubia', 'sharqia', 'dakahlia', 'beheira',
  'gharbia', 'monufia', 'kafr_el_sheikh', 'damietta', 'port_said', 'ismailia',
  'suez', 'north_sinai', 'south_sinai', 'beni_suef', 'faiyum', 'minya', 'asyut',
  'sohag', 'qena', 'luxor', 'aswan', 'red_sea', 'new_valley', 'matrouh',
] as const;

export type Governorate = (typeof GOVERNORATES)[number];

export interface AddressFields {
  readonly governorate: Governorate;
  readonly city: string;
  readonly area: string;
  readonly street: string;
  readonly building: string;
  readonly floor?: string | undefined;
  readonly apartment?: string | undefined;
  readonly landmark?: string | undefined;
}

export class Address {
  private constructor(private readonly fields: AddressFields) {
    Object.freeze(this);
    Object.freeze(this.fields);
  }

  static create(fields: AddressFields): Address {
    const missing: string[] = [];
    const need = (value: string | undefined, name: string) => {
      if (!value || value.trim() === '') missing.push(name);
    };

    if (!GOVERNORATES.includes(fields.governorate)) {
      throw new InvalidMoney(`Unknown governorate: ${fields.governorate}`);
    }
    need(fields.city, 'city');
    need(fields.area, 'area');
    need(fields.street, 'street');
    need(fields.building, 'building');

    if (missing.length > 0) {
      throw new InvalidMoney(`Address is missing required parts: ${missing.join(', ')}`);
    }

    return new Address({
      governorate: fields.governorate,
      city: fields.city.trim(),
      area: fields.area.trim(),
      street: fields.street.trim(),
      building: fields.building.trim(),
      floor: fields.floor?.trim() || undefined,
      apartment: fields.apartment?.trim() || undefined,
      landmark: fields.landmark?.trim() || undefined,
    });
  }

  get governorate(): Governorate { return this.fields.governorate; }
  get city(): string { return this.fields.city; }
  get area(): string { return this.fields.area; }
  get street(): string { return this.fields.street; }
  get building(): string { return this.fields.building; }
  get floor(): string | undefined { return this.fields.floor; }
  get apartment(): string | undefined { return this.fields.apartment; }
  get landmark(): string | undefined { return this.fields.landmark; }

  /** True when a courier can plausibly find this without a phone call. */
  get hasLandmark(): boolean {
    return this.fields.landmark !== undefined;
  }

  toJSON(): AddressFields {
    return this.fields;
  }
}
