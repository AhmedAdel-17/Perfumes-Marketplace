import type { ExternalProvider } from './ports';

/**
 * Couriers.
 *
 * Bosta gives an API that creates a shipment and returns an airway bill. We do
 * not have that integration yet — but a house handing a parcel to a courier and
 * typing the tracking number off the label is not a fake version of shipping.
 * It IS shipping. Most Egyptian sellers work exactly this way today.
 *
 * So `manualCourier` declares `isStub: false`. It is a real adapter for a real
 * workflow, and a marketplace can run on it. What it cannot do is CREATE a
 * shipment with the courier or subscribe to status webhooks, and it says so
 * through `createsShipment` rather than by pretending and returning a made-up
 * number.
 *
 * That distinction matters more than it looks. Marking this a stub would block
 * production launch on a Bosta contract for no reason; marking a genuinely fake
 * adapter as real would ship a hole. The line is whether the operation actually
 * happens in the world — cash really is collected at the door, a parcel really
 * is handed over — not whether an API was involved.
 */
export interface ShipmentRequest {
  readonly subOrderReference: string;
  readonly trackingNumber: string;
  readonly codAmountPiastres: number;
}

export interface ShipmentRecord {
  readonly courier: string;
  readonly trackingNumber: string;
  /** Null when the courier gives us no label to print. */
  readonly labelUrl: string | null;
}

export interface CourierPort extends ExternalProvider {
  /**
   * False when the tracking number comes from a human reading a label, true
   * when the courier's API issues it. Drives whether the seller is ASKED for a
   * number or simply shown one.
   */
  readonly createsShipment: boolean;
  book(request: ShipmentRequest): Promise<ShipmentRecord>;
}

/**
 * Tracking numbers, as they arrive from a person typing.
 *
 * Deliberately permissive about format — couriers differ, and rejecting a valid
 * airway bill because it does not match a guessed pattern strands a parcel that
 * has physically left the building. It rejects only what cannot be a tracking
 * number at all.
 */
export const TRACKING_MIN = 4;
export const TRACKING_MAX = 40;

export function normaliseTrackingNumber(input: string): string | null {
  // Couriers print these with spaces and hyphens for readability; a customer
  // reading one aloud will include them and a seller copying one will not.
  const cleaned = input.trim().toUpperCase().replace(/[\s-]/g, '');
  if (cleaned.length < TRACKING_MIN || cleaned.length > TRACKING_MAX) return null;
  if (!/^[A-Z0-9]+$/.test(cleaned)) return null;
  return cleaned;
}

export const manualCourier: CourierPort = {
  name: 'manual-courier',
  // Real. A parcel genuinely changes hands; only the API is absent.
  isStub: false,
  createsShipment: false,
  async book({ trackingNumber }): Promise<ShipmentRecord> {
    const normalised = normaliseTrackingNumber(trackingNumber);
    if (!normalised) {
      throw new Error(`"${trackingNumber}" is not a usable tracking number`);
    }
    return { courier: 'manual', trackingNumber: normalised, labelUrl: null };
  },
};
