import { describe, it, expect } from 'vitest';
import { canConfirmStake } from '@/lib/goals/confirm-guard';
import { reviewDecisionSchema, reconcilePayoutsSchema } from '@/lib/validation/review-schemas';

describe('canConfirmStake', () => {
  it('allows a goal still waiting for its stake transaction', () => {
    expect(canConfirmStake({ status: 'pending_validation', stake_tx_signature: 'pending' })).toBe(true);
  });

  it('rejects a staked goal sitting in the admin review queue', () => {
    expect(canConfirmStake({ status: 'pending_validation', stake_tx_signature: '5Kx'.repeat(20) })).toBe(false);
  });

  it('rejects other statuses and missing signatures', () => {
    for (const status of ['active', 'completed', 'failed']) {
      expect(canConfirmStake({ status, stake_tx_signature: 'pending' })).toBe(false);
    }
    expect(canConfirmStake({ status: 'pending_validation', stake_tx_signature: null })).toBe(false);
    expect(canConfirmStake({ status: 'pending_validation' })).toBe(false);
  });
});

describe('review schemas', () => {
  const id = '3f8b0f6e-6a3c-4d64-9b0e-2f6e7a1c9d10';

  it('accepts a valid decision', () => {
    expect(reviewDecisionSchema.safeParse({ goalId: id, decision: 'approve' }).success).toBe(true);
    expect(reviewDecisionSchema.safeParse({ goalId: id, decision: 'reject' }).success).toBe(true);
  });

  it('rejects a non-uuid goal id and unknown decisions', () => {
    expect(reviewDecisionSchema.safeParse({ goalId: 'abc', decision: 'approve' }).success).toBe(false);
    expect(reviewDecisionSchema.safeParse({ goalId: id, decision: 'maybe' }).success).toBe(false);
    expect(reviewDecisionSchema.safeParse({ decision: 'approve' }).success).toBe(false);
  });

  it('reconcile body: optional uuid, no extra keys', () => {
    expect(reconcilePayoutsSchema.safeParse({}).success).toBe(true);
    expect(reconcilePayoutsSchema.safeParse({ payoutId: id }).success).toBe(true);
    expect(reconcilePayoutsSchema.safeParse({ payoutId: 'x' }).success).toBe(false);
    expect(reconcilePayoutsSchema.safeParse({ other: 1 }).success).toBe(false);
  });
});
