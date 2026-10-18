/**
 * Pattern — Idempotent Command + Repository within Unit of Work.
 * One attempt set yields one committed order. The response contains no contact
 * or address; its request fingerprint is a hash, never the raw customer input.
 */
export interface CheckoutResponse {
  readonly reference: string;
  readonly totalPiastres: number;
  readonly houseCount: number;
  readonly etaDaysMin: number;
  readonly etaDaysMax: number;
}
export interface CheckoutReplay {
  readonly requestHash: string;
  readonly response: CheckoutResponse;
}
export interface CheckoutReplayRepository {
  /** Serialize competing attempts for this key until the enclosing UoW ends. */
  lockAndRead(key: string, now: Date): Promise<CheckoutReplay | null>;
  /** Save atomically with order + transitions; callers must hold the key lock. */
  save(key: string, replay: CheckoutReplay, expiresAt: Date): Promise<void>;
}
