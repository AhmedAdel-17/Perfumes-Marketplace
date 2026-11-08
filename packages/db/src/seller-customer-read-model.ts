/**
 * Ports & Adapters: bounded owner-capability projections, never table access.
 * Database functions recheck ownership and derive tenant on every call. The
 * adapter validates the returned shape and never forwards accidental columns.
 */
import { sql } from 'drizzle-orm';
import type { SellerCustomerReadModel, SellerCustomerSummary } from '@diyar/domain';
import type { DiyarDatabase } from './repositories';
interface RawSummary {
  customerRef: string; fullName: string | null; completedOrders: string;
  firstDeliveredAt: string; lastDeliveredAt: string;
}
interface RawProfile extends RawSummary { orders: Array<{ reference: string; deliveredAt: string }> }
interface AggregateResult { access: string; customers?: RawSummary[]; profile?: RawProfile | null }
function summary(row: RawSummary): SellerCustomerSummary {
  const completedOrders = Number(row.completedOrders);
  const firstDeliveredAt = new Date(row.firstDeliveredAt);
  const lastDeliveredAt = new Date(row.lastDeliveredAt);
  if (!/^C-[a-f0-9]{32}$/.test(row.customerRef) || !Number.isSafeInteger(completedOrders) || completedOrders < 1
    || (row.fullName !== null && typeof row.fullName !== 'string')
    || !Number.isFinite(firstDeliveredAt.getTime()) || !Number.isFinite(lastDeliveredAt.getTime())) {
    throw new Error('Invalid seller customer aggregate row');
  }
  return { customerRef: row.customerRef, fullName: row.fullName, completedOrders, firstDeliveredAt, lastDeliveredAt };
}
function payload(result: unknown): AggregateResult {
  const rows: unknown = Array.isArray(result) ? result
    : result && typeof result === 'object' && 'rows' in result ? result.rows : undefined;
  if (!Array.isArray(rows)) throw new Error('Invalid seller customer driver response');
  const row: unknown = rows[0];
  if (!row || typeof row !== 'object' || !('result' in row)) throw new Error('Missing seller customer aggregate');
  const value: unknown = row.result;
  if (!value || typeof value !== 'object' || !('access' in value)
    || (value.access !== 'restricted' && value.access !== 'owner')) throw new Error('Invalid seller customer aggregate');
  return value as AggregateResult;
}
export const sellerCustomerReadModel = (db: DiyarDatabase): SellerCustomerReadModel => ({
  async leaderboard({ limit }) {
    const value = payload(await db.execute(sql`SELECT app.seller_customer_leaderboard(${limit}::integer) AS result`));
    if (value.access === 'restricted') return { access: 'restricted' };
    if (!Array.isArray(value.customers)) throw new Error('Invalid seller customer list');
    return { access: 'owner', customers: value.customers.map(summary) };
  },
  async profile({ customerRef, limit }) {
    const value = payload(await db.execute(sql`SELECT app.seller_customer_profile(${customerRef}::text, ${limit}::integer) AS result`));
    if (value.access === 'restricted') return { access: 'restricted' };
    if (value.profile === null) return { access: 'owner', profile: null };
    if (!value.profile || !Array.isArray(value.profile.orders)) throw new Error('Invalid seller customer profile');
    return { access: 'owner', profile: { ...summary(value.profile), orders: value.profile.orders.map(row => {
      const deliveredAt = new Date(row.deliveredAt);
      if (typeof row.reference !== 'string' || !Number.isFinite(deliveredAt.getTime())) throw new Error('Invalid customer completed order');
      return { reference: row.reference, deliveredAt };
    }) } };
  },
});


