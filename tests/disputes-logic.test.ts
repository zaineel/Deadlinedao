import { describe, it, expect } from 'vitest';
import {
  APPEAL_WINDOW_MS,
  computeAppealDeadline,
  computeBond,
  checkCanOpenDispute,
  isAppealWindowClosed,
  isAppealWindowOpen,
  isUnsettledStatus,
  planResolution,
  poolGoals,
  unsettledGoals,
} from '@/lib/disputes/logic';
import { hasEscrowTransfer } from '@/lib/solana/transfer-check';
import { createDisputeSchema, resolveDisputeSchema } from '@/lib/validation/dispute-schemas';

const OWNER = 'OwnerWallet1111111111111111111111111111111';
const NOW = new Date('2026-01-10T12:00:00.000Z');
const goal = (over: Partial<{ wallet_address: string; status: string; appeal_deadline: string | null }> = {}) => ({
  wallet_address: OWNER,
  status: 'rejected_appealable',
  appeal_deadline: new Date(NOW.getTime() + 3_600_000).toISOString(),
  ...over,
});
const open = (over: Partial<Parameters<typeof checkCanOpenDispute>[0]> = {}) =>
  checkCanOpenDispute({
    goal: goal(),
    sessionWallet: OWNER,
    existingDispute: false,
    signatureAlreadyUsed: false,
    now: NOW,
    ...over,
  });

describe('bond and window math', () => {
  it('bond is 5% of the stake', () => {
    expect(computeBond(1)).toBe(0.05);
    expect(computeBond(2)).toBe(0.1);
    expect(computeBond(0.5)).toBe(0.025);
  });
  it('rounds the bond up to a whole lamport', () => {
    expect(computeBond(0.000000001)).toBe(0.000000001); // 1 lamport stake -> 1 lamport bond
    expect(computeBond(0.0000000011)).toBe(0.000000001);
  });
  it('rejects invalid stakes', () => {
    expect(() => computeBond(0)).toThrow();
    expect(() => computeBond(-1)).toThrow();
    expect(() => computeBond(NaN)).toThrow();
  });
  it('window is exactly 48 hours', () => {
    expect(APPEAL_WINDOW_MS).toBe(48 * 3600 * 1000);
    expect(computeAppealDeadline(NOW).getTime() - NOW.getTime()).toBe(APPEAL_WINDOW_MS);
  });
  it('window open/closed boundaries are complementary and exclusive at the deadline', () => {
    const d = NOW.toISOString();
    expect(isAppealWindowOpen(d, NOW.getTime() - 1)).toBe(true);
    expect(isAppealWindowOpen(d, NOW)).toBe(false);
    expect(isAppealWindowClosed(d, NOW)).toBe(true);
    expect(isAppealWindowClosed(d, NOW.getTime() - 1)).toBe(false);
  });
  it('missing or invalid deadline is never open and never auto-closed', () => {
    for (const bad of [null, undefined, 'nope']) {
      expect(isAppealWindowOpen(bad, NOW)).toBe(false);
      expect(isAppealWindowClosed(bad, NOW)).toBe(false);
    }
  });
});

describe('checkCanOpenDispute', () => {
  it('allows the owner inside the window', () => {
    expect(open()).toEqual({ ok: true });
  });
  it('refuses a non-owner', () => {
    expect(open({ sessionWallet: 'Someone' })).toEqual({ ok: false, reason: 'not_owner' });
  });
  it('enforces one dispute per goal', () => {
    expect(open({ existingDispute: true })).toEqual({ ok: false, reason: 'already_disputed' });
  });
  it('enforces the appeal window', () => {
    const closed = goal({ appeal_deadline: new Date(NOW.getTime() - 1).toISOString() });
    expect(open({ goal: closed })).toEqual({ ok: false, reason: 'window_closed' });
    expect(open({ goal: goal({ appeal_deadline: null }) })).toEqual({ ok: false, reason: 'window_closed' });
  });
  it.each(['active', 'pending_validation', 'completed', 'failed', 'disputed'])(
    'refuses a goal in status %s',
    (status) => {
      expect(open({ goal: goal({ status }) })).toEqual({ ok: false, reason: 'not_appealable' });
    }
  );
  it('refuses a reused bond signature', () => {
    expect(open({ signatureAlreadyUsed: true })).toEqual({ ok: false, reason: 'signature_reused' });
  });
});

describe('planResolution', () => {
  it('overturn: completes the goal, returns the stake and refunds the bond', () => {
    expect(planResolution({ disputeStatus: 'open', goalStatus: 'disputed', decision: 'overturn' })).toEqual({
      kind: 'apply',
      decision: 'overturn',
      goalTo: 'completed',
      transitionFrom: 'disputed',
      disputeTo: 'overturned',
      returnStake: true,
      refundBond: true,
    });
  });
  it('uphold: fails the goal and keeps the bond', () => {
    expect(planResolution({ disputeStatus: 'open', goalStatus: 'disputed', decision: 'uphold' })).toEqual({
      kind: 'apply',
      decision: 'uphold',
      goalTo: 'failed',
      transitionFrom: 'disputed',
      disputeTo: 'upheld',
      returnStake: false,
      refundBond: false,
    });
  });
  it.each(['overturned', 'upheld'] as const)('double-resolve of a %s dispute is a no-op', (disputeStatus) => {
    for (const decision of ['overturn', 'uphold'] as const) {
      expect(planResolution({ disputeStatus, goalStatus: 'completed', decision })).toEqual({
        kind: 'noop',
        reason: 'already_resolved',
      });
    }
  });
  it('resumes an overturn after a partial failure (goal already completed, dispute still open)', () => {
    const plan = planResolution({ disputeStatus: 'open', goalStatus: 'completed', decision: 'overturn' });
    expect(plan).toMatchObject({ kind: 'apply', transitionFrom: null, returnStake: true, refundBond: true });
  });
  it('does not resume into the opposite outcome', () => {
    expect(planResolution({ disputeStatus: 'open', goalStatus: 'completed', decision: 'uphold' })).toEqual({
      kind: 'noop',
      reason: 'goal_not_disputed',
    });
  });
  it.each(['active', 'rejected_appealable', 'pending_validation'])(
    'is a no-op when the goal is %s',
    (goalStatus) => {
      expect(planResolution({ disputeStatus: 'open', goalStatus, decision: 'overturn' }).kind).toBe('noop');
    }
  );
});

describe('reward pool', () => {
  const goals = [
    { id: 'a', status: 'failed' },
    { id: 'b', status: 'rejected_appealable' },
    { id: 'c', status: 'disputed' },
    { id: 'd', status: 'completed' },
    { id: 'e', status: 'active' },
  ];
  it('only failed goals feed the pool', () => {
    expect(poolGoals(goals).map((g) => g.id)).toEqual(['a']);
  });
  it('unresolved appeals are detected so distribution can be refused', () => {
    expect(unsettledGoals(goals).map((g) => g.id)).toEqual(['b', 'c']);
    expect(isUnsettledStatus('failed')).toBe(false);
    expect(isUnsettledStatus('disputed')).toBe(true);
  });
});

describe('hasEscrowTransfer (bond / stake verification)', () => {
  const ESCROW = 'EscrowWallet';
  const ix = (over: Record<string, unknown> = {}) => ({
    program: 'system',
    parsed: {
      type: 'transfer',
      info: { source: OWNER, destination: ESCROW, lamports: 50_000_000, ...over },
    },
  });
  it('accepts the right sender, destination and amount', () => {
    expect(hasEscrowTransfer([ix()], ESCROW, OWNER, 50_000_000)).toBe(true);
    expect(hasEscrowTransfer([ix({ lamports: 60_000_000 })], ESCROW, OWNER, 50_000_000)).toBe(true);
  });
  it('rejects a wrong amount', () => {
    expect(hasEscrowTransfer([ix({ lamports: 49_999_999 })], ESCROW, OWNER, 50_000_000)).toBe(false);
  });
  it('rejects a wrong sender', () => {
    expect(hasEscrowTransfer([ix({ source: 'Other' })], ESCROW, OWNER, 50_000_000)).toBe(false);
  });
  it('rejects a wrong destination', () => {
    expect(hasEscrowTransfer([ix({ destination: 'Other' })], ESCROW, OWNER, 50_000_000)).toBe(false);
  });
  it('ignores non-system and non-transfer instructions, and finds a later match', () => {
    const noise = [
      { programId: 'x' },
      { program: 'spl-token', parsed: { type: 'transfer', info: {} } },
      { program: 'system', parsed: { type: 'createAccount', info: {} } },
    ];
    expect(hasEscrowTransfer(noise, ESCROW, OWNER, 1)).toBe(false);
    expect(hasEscrowTransfer([...noise, ix()], ESCROW, OWNER, 50_000_000)).toBe(true);
  });
});

describe('dispute schemas', () => {
  const goalId = '123e4567-e89b-12d3-a456-426614174000';
  it('accepts a valid appeal', () => {
    expect(
      createDisputeSchema.safeParse({ goalId, reason: 'The photo clearly shows my work', bondSignature: 'sig' }).success
    ).toBe(true);
  });
  it('rejects short reasons, bad ids and missing signatures', () => {
    expect(createDisputeSchema.safeParse({ goalId, reason: 'short', bondSignature: 'sig' }).success).toBe(false);
    expect(createDisputeSchema.safeParse({ goalId: 'x', reason: 'long enough reason', bondSignature: 's' }).success).toBe(false);
    expect(createDisputeSchema.safeParse({ goalId, reason: 'long enough reason' }).success).toBe(false);
  });
  it('rejects non-https evidence', () => {
    expect(
      createDisputeSchema.safeParse({
        goalId,
        reason: 'long enough reason',
        bondSignature: 's',
        extraImageUrl: 'http://x.test/a.png',
      }).success
    ).toBe(false);
  });
  it('resolve accepts only overturn or uphold', () => {
    expect(resolveDisputeSchema.safeParse({ disputeId: goalId, decision: 'overturn' }).success).toBe(true);
    expect(resolveDisputeSchema.safeParse({ disputeId: goalId, decision: 'approve' }).success).toBe(false);
  });
});
