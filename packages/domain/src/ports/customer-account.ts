/** Repository + read model: personal attributes stay separate from financial snapshots. */
export const CUSTOMER_GENDERS = ['female', 'male', 'other'] as const;
export const SCENT_PREFERENCES = ['fresh', 'floral', 'woody', 'amber', 'spicy', 'gourmand', 'musk', 'citrus'] as const;
export const SEASON_PREFERENCES = ['spring', 'summer', 'autumn', 'winter'] as const;
export const OCCASION_PREFERENCES = ['everyday', 'work', 'evening', 'special'] as const;
export const CONCENTRATION_PREFERENCES = ['edt', 'edp', 'extrait', 'oil'] as const;
export interface CustomerProfileInput {
    fullName: string;
    email: string | null;
    dateOfBirth: string;
    gender: typeof CUSTOMER_GENDERS[number];
    families: string[];
    notes: string[];
    occasions: string[];
    seasons: string[];
    concentrations: string[];
    bottleSizes: number[];
    budgetMinPiastres: number | null;
    budgetMaxPiastres: number | null;
    personalizationConsent: boolean;
    marketingConsent: boolean;
}
export interface CustomerAccount extends Omit<CustomerProfileInput, 'gender'> {
    gender: typeof CUSTOMER_GENDERS[number] | null;
    customerId: string;
    phone: string;
    profileComplete: boolean;
    updatedAt: string | null;
}
export interface SavedCustomerAddress {
    id: string;
    label: string | null;
    governorate: string;
    city: string;
    area: string;
    street: string;
    building: string;
    floor: string | null;
    apartment: string | null;
    landmark: string | null;
    contactPhone: string;
    isDefault: boolean;
}
export type CustomerAddressInput = Omit<SavedCustomerAddress, 'id'>;
export interface CustomerOrderSummary {
    reference: string;
    contactPhone: string;
    totalPiastres: number;
    placedAt: string;
}
export interface CustomerAccountRepository {
    profile(): Promise<CustomerAccount | null>;
    saveProfile(input: CustomerProfileInput): Promise<void>;
    addresses(): Promise<SavedCustomerAddress[]>;
    addAddress(input: CustomerAddressInput): Promise<void>;
    removeAddress(id: string): Promise<void>;
    orders(): Promise<CustomerOrderSummary[]>;
}
export interface CustomerPrincipal {
    customerId: string;
    authUserId: string;
    phone: string;
}
export interface ActiveCustomerSession extends CustomerPrincipal {
    sessionId: string;
}
