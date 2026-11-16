import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getGoalById: vi.fn(),
  transitionGoalStatus: vi.fn(),
  getProofsByGoal: vi.fn(),
  getDisputeById: vi.fn(),
  getDisputeByGoal: vi.fn(),
  getDisputeBySignature: vi.fn(),
  isStakeSignature: vi.fn(),
  createDispute: vi.fn(),
  finalizeDispute: vi.fn(),
  verifyStakeTransaction: vi.fn(),
  returnStake: vi.fn(),
  claimPayout: vi.fn(),
  finalizePayout: vi.fn(),
  releasePayout: vi.fn(),
  sendPayoutFromEscrow: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('@/lib/supabase/goals', () => ({
  getGoalById: m.getGoalById,
  transitionGoalStatus: m.transitionGoalStatus,
}));
vi.mock('@/lib/supabase/proofs', () => ({ getProofsByGoal: m.getProofsByGoal }));
vi.mock('@/lib/supabase/disputes', () => ({
  getDisputeById: m.getDisputeById,
  getDisputeByGoal: m.getDisputeByGoal,
  getDisputeBySignature: m.getDisputeBySignature,
  isStakeSignature: m.isStakeSignature,
  createDispute: m.createDispute,
  finalizeDispute: m.finalizeDispute,
}));
vi.mock('@/lib/supabase/payouts', () => ({
  claimPayout: m.claimPayout,
  finalizePayout: m.finalizePayout,
  releasePayout: m.releasePayout,
}));
vi.mock('@/lib/solana/escrow', () => ({
  verifyStakeTransaction: m.verifyStakeTransaction,
  sendPayoutFromEscrow: m.sendPayoutFromEscrow,
}));
vi.mock('@/lib/solana/stake-return', () => ({ returnStake: m.returnStake }));
vi.mock('@/lib/notify', () => ({ notify: m.notify }));

import { openDispute } from '@/lib/disputes/open';
import { resolveDispute } from '@/lib/disputes/resolve';
import { refundBond } from '@/lib/disputes/settle';
import { safeNotify } from '@/lib/disputes/notify';

const OWNER = 'OwnerWallet1111111111111111111111111111111';
const NOW = new Date('2026-01-10T12:00:00.000Z');
const future = new Date(NOW.getTime() + 3_600_000).toISOString();

const goal = (over: Record<string, unknown> = {}) => ({
  id: 'g1',
  wallet_address: OWNER,
  title: 'Run',
  stake_amount: 2,
  status: 'rejected_appealable',
  appeal_deadline: future,
  ...over,
});
const dispute = (over: Record<string, unknown> = {}) => ({
  id: 'd1',
  goal_id: 'g1',
  bond_amount: 0.1,
  status: 'open',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.DEMO_MODE;
  delete process.env.NEXT_PUBLIC_DEMO_MODE;
  m.getGoalById.mockResolvedValue({ data: goal(), error: null });
  m.getDisputeByGoal.mockResolvedValue({ data: null, error: null });
  m.getDisputeBySignature.mockResolvedValue({ data: null, error: null });
  m.isStakeSignature.mockResolvedValue({ used: false, error: null });
  m.verifyStakeTransaction.mockResolvedValue({ valid: true, error: null });
  m.transitionGoalStatus.mockResolvedValue({ data: goal({ status: 'disputed' }), error: null });
  m.getProofsByGoal.mockResolvedValue({ data: [{ id: 'p1' }], error: null });
  m.createDispute.mockResolvedValue({ data: dispute(), duplicate: false, error: null });
  m.getDisputeById.mockResolvedValue({ data: dispute(), error: null });
  m.finalizeDispute.mockResolvedValue({ finalized: true, error: null });
  m.returnStake.mockResolvedValue({ status: 'sent', signature: 'stakeSig', amount: 2 });
  m.claimPayout.mockResolvedValue({ claimed: true, payoutId: 'pay1', error: null });
  m.sendPayoutFromEscrow.mockResolvedValue({ signature: 'bondSig', error: null });
  m.notify.mockResolvedValue({});
});

const input = (over: Record<string, unknown> = {}) => ({
  sessionWallet: OWNER,
  goalId: 'g1',
  reason: 'my reason',
  bondSignature: 'bondTx',
  now: NOW,
  ...over,
});

describe('openDispute', () => {
  it('opens a dispute: verifies the 5% bond from the session wallet, moves the goal, records it', async () => {
    const r = await openDispute(input());
    expect(r).toEqual({ status: 'opened', disputeId: 'd1', bondAmount: 0.1 });
    expect(m.verifyStakeTransaction).toHaveBeenCalledWith('bondTx', 0.1, OWNER);
    expect(m.transitionGoalStatus).toHaveBeenCalledWith('g1', 'rejected_appealable', 'disputed');
    expect(m.createDispute).toHaveBeenCalledWith(
      expect.objectContaining({ goal_id: 'g1', proof_id: 'p1', bond_amount: 0.1, bond_tx_signature: 'bondTx' })
    );
  });

  it('hides goals owned by someone else', async () => {
    expect(await openDispute(input({ sessionWallet: 'Other' }))).toEqual({ status: 'goal_not_found' });
    expect(m.verifyStakeTransaction).not.toHaveBeenCalled();
  });

  it('refuses a second dispute on the same goal without touching the chain', async () => {
    m.getDisputeByGoal.mockResolvedValue({ data: dispute(), error: null });
    expect(await openDispute(input())).toEqual({ status: 'refused', reason: 'already_disputed' });
    expect(m.verifyStakeTransaction).not.toHaveBeenCalled();
    expect(m.transitionGoalStatus).not.toHaveBeenCalled();
  });

  it('refuses after the window closed', async () => {
    m.getGoalById.mockResolvedValue({
      data: goal({ appeal_deadline: new Date(NOW.getTime() - 1).toISOString() }),
      error: null,
    });
    expect(await openDispute(input())).toEqual({ status: 'refused', reason: 'window_closed' });
    expect(m.verifyStakeTransaction).not.toHaveBeenCalled();
  });

  it('refuses a bond signature already used by another dispute', async () => {
    m.getDisputeBySignature.mockResolvedValue({ data: dispute({ goal_id: 'other' }), error: null });
    expect(await openDispute(input())).toEqual({ status: 'refused', reason: 'signature_reused' });
    expect(m.transitionGoalStatus).not.toHaveBeenCalled();
  });

  it('refuses a stake transaction reused as a bond', async () => {
    m.isStakeSignature.mockResolvedValue({ used: true, error: null });
    expect(await openDispute(input())).toEqual({ status: 'refused', reason: 'signature_reused' });
  });

  it('rejects a bond that fails on-chain verification (wrong amount or sender)', async () => {
    m.verifyStakeTransaction.mockResolvedValue({ valid: false, error: new Error('no') });
    expect(await openDispute(input())).toEqual({ status: 'bond_invalid' });
    expect(m.transitionGoalStatus).toHaveBeenLastCalledWith('g1', 'disputed', 'rejected_appealable');
    expect(m.createDispute).not.toHaveBeenCalled();
  });

  it('hands the goal back when verification throws', async () => {
    m.verifyStakeTransaction.mockRejectedValue(new Error('rpc down'));
    expect(await openDispute(input())).toEqual({ status: 'bond_invalid' });
    expect(m.transitionGoalStatus).toHaveBeenLastCalledWith('g1', 'disputed', 'rejected_appealable');
  });

  it('claims the goal before verifying, so a window closing mid-flight can never strand a paid bond', async () => {
    const order: string[] = [];
    m.transitionGoalStatus.mockImplementation(async () => { order.push('claim'); return { data: goal({ status: 'disputed' }), error: null }; });
    m.verifyStakeTransaction.mockImplementation(async () => { order.push('verify'); return { valid: true, error: null }; });
    await openDispute(input());
    expect(order).toEqual(['claim', 'verify']);
  });

  it('only skips chain verification for demo_tx_ signatures in demo mode', async () => {
    await openDispute(input({ bondSignature: 'demo_tx_1' }));
    expect(m.verifyStakeTransaction).toHaveBeenCalled();
    m.verifyStakeTransaction.mockClear();
    process.env.DEMO_MODE = 'true';
    const r = await openDispute(input({ bondSignature: 'demo_tx_2' }));
    expect(r.status).toBe('opened');
    expect(m.verifyStakeTransaction).not.toHaveBeenCalled();
  });

  it('refuses when the goal was moved concurrently (cron or a parallel request)', async () => {
    m.transitionGoalStatus.mockResolvedValue({ data: null, error: null });
    expect(await openDispute(input())).toEqual({ status: 'refused', reason: 'not_appealable' });
    expect(m.verifyStakeTransaction).not.toHaveBeenCalled();
    expect(m.createDispute).not.toHaveBeenCalled();
  });

  it('reverts the goal when the dispute row loses a unique race', async () => {
    m.createDispute.mockResolvedValue({ data: null, duplicate: true, error: null });
    expect(await openDispute(input())).toEqual({ status: 'refused', reason: 'already_disputed' });
    expect(m.transitionGoalStatus).toHaveBeenLastCalledWith('g1', 'disputed', 'rejected_appealable');
  });
});

describe('resolveDispute', () => {
  beforeEach(() => {
    m.getGoalById.mockResolvedValue({ data: goal({ status: 'disputed' }), error: null });
  });

  it('overturn: completes the goal, returns the stake, refunds the bond, finalizes, notifies', async () => {
    const r = await resolveDispute('d1', 'overturn');
    expect(r).toEqual({ status: 'resolved', outcome: 'overturned', stakeSignature: 'stakeSig', bondSignature: 'bondSig' });
    expect(m.transitionGoalStatus).toHaveBeenCalledWith('g1', 'disputed', 'completed');
    expect(m.returnStake).toHaveBeenCalledTimes(1);
    expect(m.claimPayout).toHaveBeenCalledWith('g1', OWNER, 0.1, 'bond_refund');
    expect(m.sendPayoutFromEscrow).toHaveBeenCalledWith(OWNER, 0.1);
    expect(m.finalizePayout).toHaveBeenCalledWith('pay1', 'bondSig');
    expect(m.finalizeDispute).toHaveBeenCalledWith('d1', 'overturned');
    expect(m.notify).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'appeal_resolved', outcome: 'overturned' }),
      { wallet: OWNER }
    );
  });

  it('uphold: fails the goal, moves no money, keeps the bond', async () => {
    const r = await resolveDispute('d1', 'uphold');
    expect(r).toMatchObject({ status: 'resolved', outcome: 'upheld' });
    expect(m.transitionGoalStatus).toHaveBeenCalledWith('g1', 'disputed', 'failed');
    expect(m.returnStake).not.toHaveBeenCalled();
    expect(m.claimPayout).not.toHaveBeenCalled();
    expect(m.sendPayoutFromEscrow).not.toHaveBeenCalled();
    expect(m.notify).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'upheld' }), { wallet: OWNER });
  });

  it.each(['overturned', 'upheld'])('double-resolve of an already %s dispute is a no-op', async (status) => {
    m.getDisputeById.mockResolvedValue({ data: dispute({ status }), error: null });
    m.getGoalById.mockResolvedValue({ data: goal({ status: 'completed' }), error: null });
    const r = await resolveDispute('d1', 'overturn');
    expect(r).toEqual({ status: 'noop', reason: 'already_resolved', disputeStatus: status });
    expect(m.transitionGoalStatus).not.toHaveBeenCalled();
    expect(m.returnStake).not.toHaveBeenCalled();
    expect(m.claimPayout).not.toHaveBeenCalled();
    expect(m.notify).not.toHaveBeenCalled();
  });

  it('returns not_found for an unknown dispute', async () => {
    m.getDisputeById.mockResolvedValue({ data: null, error: null });
    expect(await resolveDispute('nope', 'uphold')).toEqual({ status: 'not_found' });
  });

  it('is a no-op if another admin moved the goal first', async () => {
    m.transitionGoalStatus.mockResolvedValue({ data: null, error: null });
    expect((await resolveDispute('d1', 'overturn')).status).toBe('noop');
    expect(m.returnStake).not.toHaveBeenCalled();
  });

  it('keeps the dispute open when the stake return fails, and never refunds the bond', async () => {
    m.returnStake.mockResolvedValue({ status: 'failed', amount: 2, error: 'x' });
    expect(await resolveDispute('d1', 'overturn')).toEqual({ status: 'payout_failed' });
    expect(m.claimPayout).not.toHaveBeenCalled();
    expect(m.finalizeDispute).not.toHaveBeenCalled();
  });

  it('keeps the dispute open when the bond refund fails and releases the claim', async () => {
    m.sendPayoutFromEscrow.mockResolvedValue({ signature: null, error: new Error('x') });
    expect(await resolveDispute('d1', 'overturn')).toEqual({ status: 'payout_failed' });
    expect(m.releasePayout).toHaveBeenCalledWith('pay1');
    expect(m.finalizeDispute).not.toHaveBeenCalled();
  });

  it('retry after a partial failure resumes without re-transitioning and never double-pays', async () => {
    m.getGoalById.mockResolvedValue({ data: goal({ status: 'completed' }), error: null });
    m.returnStake.mockResolvedValue({ status: 'already_paid', amount: 2 });
    m.claimPayout.mockResolvedValue({ claimed: false, payoutId: null, error: null });
    const r = await resolveDispute('d1', 'overturn');
    expect(r).toEqual({ status: 'resolved', outcome: 'overturned', stakeSignature: undefined, bondSignature: undefined });
    expect(m.transitionGoalStatus).not.toHaveBeenCalled();
    expect(m.sendPayoutFromEscrow).not.toHaveBeenCalled();
  });

  it('only the caller that finalized the dispute notifies', async () => {
    m.finalizeDispute.mockResolvedValue({ finalized: false, error: null });
    await resolveDispute('d1', 'uphold');
    expect(m.notify).not.toHaveBeenCalled();
  });

  it('a failing notification never breaks the resolution', async () => {
    m.notify.mockRejectedValue(new Error('smtp down'));
    const r = await resolveDispute('d1', 'overturn');
    expect(r).toMatchObject({ status: 'resolved', outcome: 'overturned' });
  });
});

describe('refundBond / safeNotify', () => {
  it('does not send when the claim was already taken', async () => {
    m.claimPayout.mockResolvedValue({ claimed: false, payoutId: null, error: null });
    expect(await refundBond('g1', OWNER, 0.1)).toEqual({ status: 'already_paid', amount: 0.1 });
    expect(m.sendPayoutFromEscrow).not.toHaveBeenCalled();
  });
  it('does not send when the claim errored', async () => {
    m.claimPayout.mockResolvedValue({ claimed: false, payoutId: null, error: new Error('db') });
    expect((await refundBond('g1', OWNER, 0.1)).status).toBe('failed');
    expect(m.sendPayoutFromEscrow).not.toHaveBeenCalled();
  });
  it('safeNotify swallows errors', async () => {
    m.notify.mockRejectedValue(new Error('boom'));
    await expect(
      safeNotify({ kind: 'appeal_window_open', goalId: 'g', goalTitle: 't', closesAt: 'x' }, OWNER)
    ).resolves.toBeUndefined();
  });
});
