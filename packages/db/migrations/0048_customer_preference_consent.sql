-- Reuse the existing append-only consent ledger; no marketing-channel inference.
ALTER TYPE consent_purpose ADD VALUE IF NOT EXISTS 'personalization';
