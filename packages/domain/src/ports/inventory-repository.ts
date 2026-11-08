/**
 * Port — inventory facts and explicit corrections, scoped by the request's
 * seller/owner context in database adapters. An order reserves availability;
 * dispatch consumes physical stock; a return requires inspected adjustment.
 */
export const INVENTORY_ADJUSTMENT_REASONS = ['restock', 'count_correction', 'damage', 'return_inspected'] as const;
export type InventoryAdjustmentReason = (typeof INVENTORY_ADJUSTMENT_REASONS)[number];
export interface InventoryStock {
  readonly productId: string;
  readonly onHand: number;
  readonly reserved: number;
  readonly available: number;
}
export interface InventoryMovement {
  readonly id: string;
  readonly productId: string;
  readonly kind: string;
  readonly deltaOnHand: number;
  readonly deltaReserved: number;
  readonly reason: string;
  readonly occurredAt: Date;
}
export interface InventoryAdjustmentInput {
  readonly productId: string;
  readonly expectedOnHand: number;
  readonly delta: number;
  readonly reason: InventoryAdjustmentReason;
  readonly requestId: string;
  readonly occurredAt: Date;
}
export type InventoryAdjustmentResult = { readonly ok: true; readonly stock: InventoryStock }
  | { readonly ok: false; readonly reason: 'not_found' | 'conflict' | 'insufficient_stock' | 'invalid' };
export interface InventoryRepository {
  summary(productId: string): Promise<InventoryStock | null>;
  movements(productId: string, limit: number): Promise<readonly InventoryMovement[]>;
  /** Identical request replay performs no second adjustment and returns current
   * stock. Reusing an id for a different command is a conflict. */
  adjust(input: InventoryAdjustmentInput): Promise<InventoryAdjustmentResult>;
}
