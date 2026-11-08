'use server';
import { api } from '@/core/api';
import { activeSellerSession } from './actions';
/** Session-derived tenant only. The API/SQL rechecks active owner capability. */
async function customerCaller() {
  const session = await activeSellerSession();
  return session ? api({ role: 'seller', id: session.staffAuthUserId }, session.sellerId) : null;
}
export async function fetchCustomerLeaderboard(limit: 20 | 50 = 20) {
  const caller = await customerCaller();
  return caller ? caller.sellerCustomers.leaderboard({ limit }) : null;
}
export async function fetchCustomerProfile(customerRef: string) {
  const caller = await customerCaller();
  return caller ? caller.sellerCustomers.profile({ customerRef, limit: 50 }) : null;
}
