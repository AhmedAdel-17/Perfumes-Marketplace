/**
 * Port: houses applying to join, and the checklist that decides.
 *
 * The eight verification controls are seeded by a trigger the moment a seller
 * row exists (migration 0001), and the go-live gate refuses any house with an
 * unpassed control. So this port does not decide anything about eligibility —
 * it records an application, shows an operator the checklist, and lets them
 * mark controls. The database is what stops an unverified house going live.
 */

/** Doc 06 §3 — eight tracked controls, not a boolean on the seller row. */
export const VERIFICATION_CONTROLS = [
  'owner_identity', 'payout_ownership', 'product_responsibility', 'labels_artwork',
  'claims_evidence', 'return_route', 'service_capacity', 'privacy_contact',
] as const;

export type VerificationControl = (typeof VERIFICATION_CONTROLS)[number];
export type VerificationStatus = 'pending' | 'submitted' | 'approved' | 'rejected';

export interface VerificationRecord {
  readonly control: VerificationControl;
  readonly status: VerificationStatus;
  readonly notes: string | null;
  readonly reviewedAt: Date | null;
}

export interface ApplicationRecord {
  readonly id: string;
  readonly tradingName: string;
  readonly slug: string;
  readonly ownerName: string;
  readonly contactPhone: string;
  readonly contactEmail: string | null;
  readonly city: string | null;
  readonly status: string;
  readonly applicationNote: string | null;
  readonly appliedAt: Date | null;
  /** How many of the eight have passed. The number an operator triages on. */
  readonly approvedControls: number;
}

export interface ApplicationRepository {
  /**
   * Record an application.
   *
   * Returns null when the storefront address is already taken. NOT an
   * exception: two houses choosing the same wordmark is an ordinary thing that
   * happens, and the applicant needs to be told which field to change rather
   * than shown a failure.
   */
  apply(input: {
    readonly tradingName: string;
    readonly slug: string;
    readonly ownerName: string;
    readonly contactPhone: string;
    readonly contactEmail: string | null;
    readonly city: string;
    readonly note: string;
    readonly now: Date;
  }): Promise<{ readonly id: string; readonly slug: string } | null>;

  /** Everything not yet live or terminated. The operator's intake queue. */
  listApplications(): Promise<readonly ApplicationRecord[]>;

  findApplication(id: string): Promise<ApplicationRecord | null>;

  verifications(sellerId: string): Promise<readonly VerificationRecord[]>;

  /** Mark one control. Attributed, because a verification is somebody's decision. */
  setVerification(input: {
    readonly sellerId: string;
    readonly control: VerificationControl;
    readonly status: VerificationStatus;
    readonly notes: string | null;
    readonly reviewedBy: string;
    readonly now: Date;
  }): Promise<boolean>;

  /**
   * Move a house's status.
   *
   * The caller decides which move is legal. Going LIVE is additionally gated by
   * the trigger in 0001 — every control must have passed — so a bug here
   * produces a refused write rather than an unvetted house on the shopfront.
   */
  setStatus(input: {
    readonly id: string;
    readonly status: 'under_review' | 'approved' | 'live' | 'suspended' | 'terminated';
    readonly now: Date;
  }): Promise<boolean>;
}
