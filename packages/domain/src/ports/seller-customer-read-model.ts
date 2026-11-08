/**
 * Port — owner-only private customer frequency and own-house completed history.
 * Identity uses actual customer fullName, never delivery-recipient inference.
 * Scoped references are pseudonyms; no permission to contact or publish follows.
 */
export interface SellerCustomerSummary {
  readonly customerRef: string;
  readonly fullName: string | null;
  readonly completedOrders: number;
  readonly firstDeliveredAt: Date;
  readonly lastDeliveredAt: Date;
}
export interface SellerCustomerProfile extends SellerCustomerSummary {
  readonly orders: readonly { readonly reference: string; readonly deliveredAt: Date }[];
}
export type SellerCustomerLeaderboard =
  | { readonly access: 'restricted' }
  | { readonly access: 'owner'; readonly customers: readonly SellerCustomerSummary[] };
export type SellerCustomerProfileResult =
  | { readonly access: 'restricted' }
  | { readonly access: 'owner'; readonly profile: SellerCustomerProfile | null };
export interface SellerCustomerReadModel {
  leaderboard(input: { readonly limit: number }): Promise<SellerCustomerLeaderboard>;
  profile(input: { readonly customerRef: string; readonly limit: number }): Promise<SellerCustomerProfileResult>;
}
