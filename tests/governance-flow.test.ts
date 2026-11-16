import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Keypair } from '@solana/web3.js';
import { issueSession } from '@/lib/auth/session';

const m = vi.hoisted(() => ({
  // governance db
  getGovernance: vi.fn(),
  listGovernanceByIds: vi.fn(),
  listGovernanceByState: vi.fn(),
  listGovernanceNeedingRewards: vi.fn(),
  createGovernanceWithPanel: vi.fn(),
  updateGovernanceState: vi.fn(),
  claimStatsApplication: vi.fn(),
  markRewardsSettled: vi.fn(),
  listPanel: vi.fn(),
  listPanelDisputeIds: vi.fn(),
  isPanelist: vi.fn(),
  getVote: vi.fn(),
  listVotes: vi.fn(),
  insertVote: vi.fn(),
  getVoterStats: vi.fn(),
  bumpVoterStats: vi.fn(),
  getReward: vi.fn(),
  claimReward: vi.fn(),
  finalizeReward: vi.fn(),
  markRewardUnconfirmed: vi.fn(),
  releaseReward: vi.fn(),
  listRewardsByWallet: vi.fn(),
  writeAudit: vi.fn(),
  getCompletedGoalCounts: vi.fn(),
  getWalletsWithPendingDispute: vi.fn(),
  getConflictedWallets: vi.fn(),
  // others
  getDisputeById: vi.fn(),
  listOpenDisputes: vi.fn(),
  getGoalById: vi.fn(),
  getProofById: vi.fn(),
  resolveDispute: vi.fn(),
  sendPayoutFromEscrow: vi.fn(),
}));

vi.mock('@/lib/supabase/governance', () => ({
  getGovernance: m.getGovernance,
  listGovernanceByIds: m.listGovernanceByIds,
  listGovernanceByState: m.listGovernanceByState,
  listGovernanceNeedingRewards: m.listGovernanceNeedingRewards,
  createGovernanceWithPanel: m.createGovernanceWithPanel,
  updateGovernanceState: m.updateGovernanceState,
  claimStatsApplication: m.claimStatsApplication,
  markRewardsSettled: m.markRewardsSettled,
  listPanel: m.listPanel,
  listPanelDisputeIds: m.listPanelDisputeIds,
  isPanelist: m.isPanelist,
  getVote: m.getVote,
  listVotes: m.listVotes,
  insertVote: m.insertVote,
  getVoterStats: m.getVoterStats,
  bumpVoterStats: m.bumpVoterStats,
  getReward: m.getReward,
  claimReward: m.claimReward,
  finalizeReward: m.finalizeReward,
  markRewardUnconfirmed: m.markRewardUnconfirmed,
  releaseReward: m.releaseReward,
  listRewardsByWallet: m.listRewardsByWallet,
  writeAudit: m.writeAudit,
  getCompletedGoalCounts: m.getCompletedGoalCounts,
  getWalletsWithPendingDispute: m.getWalletsWithPendingDispute,
  getConflictedWallets: m.getConflictedWallets,
}));
vi.mock('@/lib/supabase/disputes', () => ({
  getDisputeById: m.getDisputeById,
  listOpenDisputes: m.listOpenDisputes,
}));
vi.mock('@/lib/supabase/goals', () => ({ getGoalById: m.getGoalById }));
vi.mock('@/lib/supabase/proofs', () => ({ getProofById: m.getProofById }));
vi.mock('@/lib/disputes/resolve', () => ({ resolveDispute: m.resolveDispute }));
vi.mock('@/lib/solana/escrow', () => ({ sendPayoutFromEscrow: m.sendPayoutFromEscrow }));

import { castVote } from '@/lib/governance/vote';
import { drawPanelForDispute } from '@/lib/governance/draw';
import { adminOverride, processVotingDispute, runGovernanceCycle, settleRewards } from '@/lib/governance/resolve';
import { payVoterReward } from '@/lib/governance/settle';
import { getGovernanceParams } from '@/lib/governance/params';
import { POST as votePost } from '@/app/api/governance/votes/route';
import { GET as listGet } from '@/app/api/governance/route';
import { GET as cronGet } from '@/app/api/cron/resolve-disputes/route';
import { POST as adminPost } from '@/app/api/admin/governance/route';
import type { DisputeGovernance } from '@/lib/supabase/governance';

const DID = '3f2b8c1e-5a47-4c0e-9d7a-1b2c3d4e5f60';
const OWNER = Keypair.generate().publicKey.toString();
const ME = Keypair.generate().publicKey.toString();
const OTHER = Keypair.generate().publicKey.toString();
const THIRD = Keypair.generate().publicKey.toString();
const NOW = new Date('2026-01-02T00:00:00.000Z');
const future = '2026-01-03T00:00:00.000Z';
const past = '2026-01-01T00:00:00.000Z';

const gov = (over: Partial<DisputeGovernance> = {}): DisputeGovernance => ({
  dispute_id: DID,
  mode: 'panel',
  state: 'voting',
  fallback_reason: null,
  panel_size: 5,
  quorum: 3,
  eligible_count: 9,
  drawn_at: past,
  voting_ends_at: future,
  escalated_reason: null,
  decision: null,
  resolved_by: null,
  resolved_at: null,
  stats_applied: false,
  rewards_settled: false,
  ...over,
});
const dispute = (over: Record<string, unknown> = {}) => ({
  id: DID,
  goal_id: 'g1',
  proof_id: 'p1',
  reason: 'AI wrong',
  extra_image_url: null,
  bond_amount: 0.01,
  bond_tx_signature: 'sig',
  status: 'open',
  resolved_at: null,
  created_at: past,
  ...over,
});
const votes = (...vs: Array<[string, 'overturn' | 'uphold']>) =>
  vs.map(([voter_wallet, vote]) => ({ dispute_id: DID, voter_wallet, vote, reason: null, created_at: past }));

let ip = 0;
function req(url: string, opts: { wallet?: string; body?: unknown; method?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { 'x-forwarded-for': `10.1.0.${++ip}`, ...(opts.headers ?? {}) };
  if (opts.wallet) headers.authorization = `Bearer ${issueSession(opts.wallet)}`;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest(`http://localhost${url}`, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  process.env.SESSION_SECRET = 'x'.repeat(40);
  process.env.FEATURE_GOVERNANCE = 'true';
  process.env.FEATURE_DISPUTES = 'true';
  process.env.CRON_SECRET = 'cronsecret';
  process.env.ADMIN_API_KEY = 'adminkey';
  m.writeAudit.mockResolvedValue({ error: null });
  m.updateGovernanceState.mockResolvedValue({ changed: true, error: null });
  m.claimStatsApplication.mockResolvedValue(true);
  m.listPanel.mockResolvedValue({ data: [ME, OTHER, THIRD], error: null });
  m.getDisputeById.mockResolvedValue({ data: dispute(), error: null });
});

describe('castVote', () => {
  const base = { wallet: ME, disputeId: DID, vote: 'uphold' as const, now: NOW };
  beforeEach(() => {
    m.isPanelist.mockResolvedValue({ is: true, error: null });
    m.getGovernance.mockResolvedValue({ data: gov(), error: null });
    m.getVote.mockResolvedValue({ data: null, error: null });
    m.insertVote.mockResolvedValue({ inserted: true, duplicate: false, error: null });
  });

  it('records a vote from a drawn panelist inside the window', async () => {
    expect(await castVote(base)).toEqual({ status: 'recorded', vote: 'uphold' });
    expect(m.insertVote).toHaveBeenCalledOnce();
  });
  it('refuses a wallet that was not drawn, without touching anything', async () => {
    m.isPanelist.mockResolvedValue({ is: false, error: null });
    expect(await castVote(base)).toEqual({ status: 'refused', reason: 'not_panelist' });
    expect(m.insertVote).not.toHaveBeenCalled();
    expect(m.getGovernance).not.toHaveBeenCalled();
  });
  it('refuses after the window closed', async () => {
    m.getGovernance.mockResolvedValue({ data: gov({ voting_ends_at: past }), error: null });
    expect(await castVote(base)).toEqual({ status: 'refused', reason: 'window_closed' });
    expect(m.insertVote).not.toHaveBeenCalled();
  });
  it('refuses when the dispute is already resolved or escalated', async () => {
    m.getGovernance.mockResolvedValue({ data: gov({ state: 'escalated' }), error: null });
    expect(await castVote(base)).toEqual({ status: 'refused', reason: 'not_voting' });
    m.getGovernance.mockResolvedValue({ data: gov(), error: null });
    m.getDisputeById.mockResolvedValue({ data: dispute({ status: 'upheld' }), error: null });
    expect(await castVote(base)).toEqual({ status: 'refused', reason: 'not_voting' });
  });
  it('a replay of the same vote is idempotent; a different second vote is refused', async () => {
    m.getVote.mockResolvedValue({ data: { vote: 'uphold' }, error: null });
    expect(await castVote(base)).toEqual({ status: 'replay', vote: 'uphold' });
    expect(await castVote({ ...base, vote: 'overturn' })).toEqual({ status: 'refused', reason: 'already_voted' });
    expect(m.insertVote).not.toHaveBeenCalled();
  });
  it('a lost insert race resolves to a replay when the stored vote matches', async () => {
    m.insertVote.mockResolvedValue({ inserted: false, duplicate: true, error: null });
    m.getVote.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: { vote: 'uphold' }, error: null });
    expect(await castVote(base)).toEqual({ status: 'replay', vote: 'uphold' });
  });
  it('fails closed on a DB error', async () => {
    m.isPanelist.mockResolvedValue({ is: false, error: new Error('db') });
    expect((await castVote(base)).status).toBe('error');
  });
});

describe('vote route', () => {
  beforeEach(() => {
    m.isPanelist.mockResolvedValue({ is: true, error: null });
    m.getGovernance.mockResolvedValue({ data: gov({ voting_ends_at: new Date(Date.now() + 3_600_000).toISOString() }), error: null });
    m.getVote.mockResolvedValue({ data: null, error: null });
    m.insertVote.mockResolvedValue({ inserted: true, duplicate: false, error: null });
  });
  it('404 when the flag is off (governance or disputes)', async () => {
    process.env.FEATURE_GOVERNANCE = 'false';
    expect((await votePost(req('/api/governance/votes', { wallet: ME, body: { disputeId: DID, vote: 'uphold' } }))).status).toBe(404);
    process.env.FEATURE_GOVERNANCE = 'true';
    process.env.FEATURE_DISPUTES = 'false';
    expect((await votePost(req('/api/governance/votes', { wallet: ME, body: { disputeId: DID, vote: 'uphold' } }))).status).toBe(404);
  });
  it('401 without a session, 400 on a bad body', async () => {
    expect((await votePost(req('/api/governance/votes', { body: { disputeId: DID, vote: 'uphold' } }))).status).toBe(401);
    expect((await votePost(req('/api/governance/votes', { wallet: ME, body: { disputeId: 'x', vote: 'uphold' } }))).status).toBe(400);
  });
  it('201 on a new vote, 200 on a replay, never exposing other votes', async () => {
    const res = await votePost(req('/api/governance/votes', { wallet: ME, body: { disputeId: DID, vote: 'uphold' } }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ success: true, replay: false, vote: 'uphold' });
    m.getVote.mockResolvedValue({ data: { vote: 'uphold' }, error: null });
    const again = await votePost(req('/api/governance/votes', { wallet: ME, body: { disputeId: DID, vote: 'uphold' } }));
    expect(again.status).toBe(200);
    expect(m.insertVote).toHaveBeenCalledOnce();
  });
  it('404 for a wallet that was not drawn, 409 for a late vote', async () => {
    m.isPanelist.mockResolvedValue({ is: false, error: null });
    expect((await votePost(req('/api/governance/votes', { wallet: OTHER, body: { disputeId: DID, vote: 'uphold' } }))).status).toBe(404);
    m.isPanelist.mockResolvedValue({ is: true, error: null });
    m.getGovernance.mockResolvedValue({ data: gov({ voting_ends_at: past }), error: null });
    expect((await votePost(req('/api/governance/votes', { wallet: ME, body: { disputeId: DID, vote: 'uphold' } }))).status).toBe(409);
  });
});

describe('assignments route: sealed votes never leak before resolution', () => {
  const setup = (state: 'voting' | 'resolved') => {
    m.listPanelDisputeIds.mockResolvedValue({ data: [DID], error: null });
    m.listGovernanceByIds.mockResolvedValue({ data: [gov({ state, decision: state === 'resolved' ? 'uphold' : null })], error: null });
    m.getGoalById.mockResolvedValue({ data: { id: 'g1', title: 'Run', description: 'Run 5k', wallet_address: OWNER }, error: null });
    m.getProofById.mockResolvedValue({
      data: { text_description: 'ran', image_url: null, ai_verdict: 'rejected', ai_confidence: 30, ai_reasoning: 'blurry' },
    });
    m.getVote.mockResolvedValue({ data: { vote: 'uphold', reason: 'mine' }, error: null });
    m.listVotes.mockResolvedValue({
      data: votes([ME, 'uphold'], [OTHER, 'overturn'], [THIRD, 'uphold']),
      error: null,
    });
    m.getVoterStats.mockResolvedValue({ data: { votes_cast: 4, votes_agreed: 3, votes_missed: 1 }, error: null });
    m.listRewardsByWallet.mockResolvedValue({ data: [], error: null });
  };

  it('while voting: other votes are not even fetched; no wallets in the payload', async () => {
    setup('voting');
    const res = await listGet(req('/api/governance', { wallet: ME }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(m.listVotes).not.toHaveBeenCalled();
    for (const secret of [OWNER, OTHER, THIRD]) expect(text).not.toContain(secret);
    const body = JSON.parse(text);
    expect(body.assignments[0].myVote).toBe('uphold');
    expect(body.assignments[0].result).toBeNull();
    expect(body.assignments[0].owner).toMatch(/^Anon-/);
    expect(body.stats).toMatchObject({ votesCast: 4, votesAgreed: 3, votesMissed: 1 });
  });
  it('after resolution: tally shown, wallets still hidden', async () => {
    setup('resolved');
    const text = await (await listGet(req('/api/governance', { wallet: ME }))).text();
    for (const secret of [OWNER, OTHER, THIRD, ME]) expect(text).not.toContain(secret);
    expect(JSON.parse(text).assignments[0].result.tally).toEqual({ overturn: 1, uphold: 2, cast: 3 });
  });
  it('404 flag off, 401 without session', async () => {
    expect((await listGet(req('/api/governance'))).status).toBe(401);
    process.env.FEATURE_GOVERNANCE = 'false';
    expect((await listGet(req('/api/governance', { wallet: ME }))).status).toBe(404);
  });
});

describe('drawPanelForDispute', () => {
  const d = { id: DID, goal_id: 'g1', status: 'open' as const };
  const params = getGovernanceParams({});
  const wallets = Array.from({ length: 12 }, () => Keypair.generate().publicKey.toString());
  beforeEach(() => {
    m.getGoalById.mockResolvedValue({ data: { id: 'g1', wallet_address: OWNER }, error: null });
    m.getCompletedGoalCounts.mockResolvedValue({
      data: new Map([[OWNER, 9], ...wallets.map((w) => [w, 4] as [string, number])]),
      error: null,
    });
    m.getWalletsWithPendingDispute.mockResolvedValue({ data: new Set<string>(), error: null });
    m.getConflictedWallets.mockResolvedValue({ data: new Set<string>(), error: null });
    m.createGovernanceWithPanel.mockResolvedValue({ created: true, duplicate: false, error: null });
  });

  it('draws M unique voters, never the owner, team/org mates or pending-dispute wallets', async () => {
    m.getConflictedWallets.mockResolvedValue({ data: new Set(wallets.slice(0, 3)), error: null });
    m.getWalletsWithPendingDispute.mockResolvedValue({ data: new Set(wallets.slice(3, 5)), error: null });
    const r = await drawPanelForDispute(d, { now: NOW, params });
    expect(r.status).toBe('panel');
    const call = m.createGovernanceWithPanel.mock.calls[0][0];
    expect(call.panel).toHaveLength(5);
    expect(new Set(call.panel).size).toBe(5);
    for (const w of call.panel) {
      expect(w).not.toBe(OWNER);
      expect(wallets.slice(0, 5)).not.toContain(w);
    }
    expect(call.eligible_count).toBe(7);
    expect(call.quorum).toBe(3);
    expect(call.voting_ends_at.toISOString()).toBe('2026-01-04T00:00:00.000Z');
  });
  it('falls back to the admin and records why when too few are eligible', async () => {
    m.getCompletedGoalCounts.mockResolvedValue({ data: new Map([[OWNER, 9], [wallets[0], 5], [wallets[1], 5]]), error: null });
    const r = await drawPanelForDispute(d, { now: NOW, params });
    expect(r).toEqual({ status: 'admin', reason: 'insufficient_eligible_voters:2<3' });
    const call = m.createGovernanceWithPanel.mock.calls[0][0];
    expect(call).toMatchObject({ mode: 'admin', panel: [], fallback_reason: 'insufficient_eligible_voters:2<3' });
  });
  it('fails closed when conflict data cannot be loaded', async () => {
    m.getConflictedWallets.mockResolvedValue({ data: null, error: new Error('db') });
    expect(await drawPanelForDispute(d, { now: NOW, params })).toEqual({ status: 'error' });
    expect(m.createGovernanceWithPanel).not.toHaveBeenCalled();
  });
  it('drawing twice is a no-op (duplicate)', async () => {
    m.createGovernanceWithPanel.mockResolvedValue({ created: false, duplicate: true, error: null });
    expect(await drawPanelForDispute(d, { now: NOW, params })).toEqual({ status: 'exists' });
  });
  it('does not draw for a resolved dispute', async () => {
    expect(await drawPanelForDispute({ ...d, status: 'upheld' }, { now: NOW, params })).toEqual({ status: 'error' });
  });
});

describe('processVotingDispute', () => {
  it('does nothing before the window closes while votes are missing', async () => {
    m.listVotes.mockResolvedValue({ data: votes([ME, 'uphold']), error: null });
    expect(await processVotingDispute(gov(), NOW)).toBe('not_due');
    expect(m.resolveDispute).not.toHaveBeenCalled();
  });
  it('resolves through resolveDispute with the majority decision once the window closed', async () => {
    m.listVotes.mockResolvedValue({ data: votes([ME, 'uphold'], [OTHER, 'uphold'], [THIRD, 'overturn']), error: null });
    m.resolveDispute.mockResolvedValue({ status: 'resolved', outcome: 'upheld' });
    expect(await processVotingDispute(gov({ voting_ends_at: past }), NOW)).toBe('resolved');
    expect(m.resolveDispute).toHaveBeenCalledWith(DID, 'uphold');
    expect(m.updateGovernanceState).toHaveBeenCalledWith(
      DID,
      ['voting', 'escalated', 'admin'],
      expect.objectContaining({ state: 'resolved', decision: 'uphold', resolved_by: 'panel' })
    );
    expect(m.bumpVoterStats).toHaveBeenCalledOnce();
  });
  it('resolves early when every panelist voted', async () => {
    m.listVotes.mockResolvedValue({ data: votes([ME, 'overturn'], [OTHER, 'overturn'], [THIRD, 'uphold']), error: null });
    m.resolveDispute.mockResolvedValue({ status: 'resolved', outcome: 'overturned' });
    expect(await processVotingDispute(gov({ panel_size: 3 }), NOW)).toBe('resolved');
    expect(m.resolveDispute).toHaveBeenCalledWith(DID, 'overturn');
  });
  it('a tie goes to the admin queue and nothing is resolved', async () => {
    m.listVotes.mockResolvedValue({
      data: votes([ME, 'uphold'], [OTHER, 'overturn'], [THIRD, 'uphold'], ['x', 'overturn']),
      error: null,
    });
    expect(await processVotingDispute(gov({ voting_ends_at: past }), NOW)).toBe('escalated');
    expect(m.resolveDispute).not.toHaveBeenCalled();
    expect(m.updateGovernanceState).toHaveBeenCalledWith(DID, ['voting'], { state: 'escalated', escalated_reason: 'tie' });
  });
  it('missing quorum goes to the admin queue', async () => {
    m.listVotes.mockResolvedValue({ data: votes([ME, 'uphold'], [OTHER, 'uphold']), error: null });
    expect(await processVotingDispute(gov({ voting_ends_at: past }), NOW)).toBe('escalated');
    expect(m.updateGovernanceState).toHaveBeenCalledWith(DID, ['voting'], { state: 'escalated', escalated_reason: 'no_quorum' });
  });
  it('a failed or unconfirmed payout keeps the dispute voting so the cron retries', async () => {
    m.listVotes.mockResolvedValue({ data: votes([ME, 'overturn'], [OTHER, 'overturn'], [THIRD, 'overturn']), error: null });
    m.resolveDispute.mockResolvedValue({ status: 'payout_unconfirmed' });
    expect(await processVotingDispute(gov({ voting_ends_at: past }), NOW)).toBe('payout_pending');
    expect(m.updateGovernanceState).not.toHaveBeenCalled();
    m.resolveDispute.mockResolvedValue({ status: 'payout_failed' });
    expect(await processVotingDispute(gov({ voting_ends_at: past }), NOW)).toBe('payout_pending');
  });
  it('a dispute the admin already resolved is closed without re-resolving', async () => {
    m.getDisputeById.mockResolvedValue({ data: dispute({ status: 'overturned' }), error: null });
    m.listVotes.mockResolvedValue({ data: [], error: null });
    expect(await processVotingDispute(gov({ voting_ends_at: past }), NOW)).toBe('closed_elsewhere');
    expect(m.resolveDispute).not.toHaveBeenCalled();
    expect(m.updateGovernanceState).toHaveBeenCalledWith(DID, expect.anything(), expect.objectContaining({ resolved_by: 'admin' }));
  });
  it('stats are applied only by the caller that flipped the state', async () => {
    m.listVotes.mockResolvedValue({ data: votes([ME, 'uphold'], [OTHER, 'uphold'], [THIRD, 'uphold']), error: null });
    m.resolveDispute.mockResolvedValue({ status: 'resolved', outcome: 'upheld' });
    m.updateGovernanceState.mockResolvedValue({ changed: false, error: null });
    await processVotingDispute(gov({ voting_ends_at: past }), NOW);
    expect(m.bumpVoterStats).not.toHaveBeenCalled();
  });
});

describe('voter rewards (claim-before-send)', () => {
  beforeEach(() => {
    m.claimReward.mockResolvedValue({ claimed: true, rewardId: 'r1', error: null });
  });

  it('pays after a definite success and records the signature', async () => {
    m.sendPayoutFromEscrow.mockResolvedValue({ signature: 'SIG', error: null, ambiguous: false });
    expect(await payVoterReward(DID, ME, 1000)).toEqual({ status: 'sent', signature: 'SIG' });
    expect(m.sendPayoutFromEscrow).toHaveBeenCalledWith(ME, 1000 / 1e9);
    expect(m.finalizeReward).toHaveBeenCalledWith('r1', 'SIG');
  });
  it('definite failure releases the claim', async () => {
    m.sendPayoutFromEscrow.mockResolvedValue({ signature: null, error: new Error('x'), ambiguous: false });
    expect(await payVoterReward(DID, ME, 1000)).toEqual({ status: 'failed' });
    expect(m.releaseReward).toHaveBeenCalledWith('r1');
  });
  it('ambiguous failure KEEPS the claim and marks unconfirmed (never released)', async () => {
    m.sendPayoutFromEscrow.mockResolvedValue({ signature: 'MAYBE', error: new Error('timeout'), ambiguous: true });
    expect(await payVoterReward(DID, ME, 1000)).toEqual({ status: 'unconfirmed', signature: 'MAYBE' });
    expect(m.releaseReward).not.toHaveBeenCalled();
    expect(m.markRewardUnconfirmed).toHaveBeenCalledWith('r1', 'MAYBE');
  });
  it('an existing claim is never re-sent', async () => {
    m.claimReward.mockResolvedValue({ claimed: false, rewardId: null, error: null });
    m.getReward.mockResolvedValue({ data: { status: 'paid' }, error: null });
    expect(await payVoterReward(DID, ME, 1000)).toEqual({ status: 'already_paid' });
    m.getReward.mockResolvedValue({ data: { status: 'unconfirmed' }, error: null });
    expect(await payVoterReward(DID, ME, 1000)).toEqual({ status: 'in_flight' });
    expect(m.sendPayoutFromEscrow).not.toHaveBeenCalled();
  });
  it('rejects non-positive or fractional amounts', async () => {
    expect((await payVoterReward(DID, ME, 0)).status).toBe('failed');
    expect((await payVoterReward(DID, ME, 1.5)).status).toBe('failed');
    expect(m.claimReward).not.toHaveBeenCalled();
  });

  describe('settleRewards', () => {
    const upheld = gov({ state: 'resolved', resolved_by: 'panel', decision: 'uphold' });
    beforeEach(() => {
      m.getDisputeById.mockResolvedValue({ data: dispute({ status: 'upheld', bond_amount: 0.01 }), error: null });
      m.listVotes.mockResolvedValue({
        data: votes([ME, 'uphold'], [OTHER, 'uphold'], [THIRD, 'overturn'], ['w4', 'uphold']),
        error: null,
      });
      m.sendPayoutFromEscrow.mockResolvedValue({ signature: 'SIG', error: null, ambiguous: false });
    });

    it('pays only majority voters an equal share of 50% of the bond, never exceeding it', async () => {
      const r = await settleRewards(upheld, getGovernanceParams({}));
      expect(r).toEqual({ paid: 3, pending: 0 });
      const amounts = m.claimReward.mock.calls.map((c) => c[2] as number);
      expect(amounts).toHaveLength(3);
      // bond 10_000_000 lamports -> pool 5_000_000 -> 1_666_666 each
      expect(amounts.every((a) => a === 1_666_666)).toBe(true);
      expect(amounts.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(10_000_000 / 2);
      expect(m.claimReward.mock.calls.map((c) => c[1])).not.toContain(THIRD);
      expect(m.markRewardsSettled).toHaveBeenCalledWith(DID);
    });
    it('is not marked settled while a payment is unconfirmed', async () => {
      m.sendPayoutFromEscrow.mockResolvedValue({ signature: 'S', error: new Error('t'), ambiguous: true });
      const r = await settleRewards(upheld, getGovernanceParams({}));
      expect(r.pending).toBe(3);
      expect(m.markRewardsSettled).not.toHaveBeenCalled();
      expect(m.releaseReward).not.toHaveBeenCalled();
    });
    it('no rewards when overturned, admin-decided, or still open', async () => {
      m.getDisputeById.mockResolvedValue({ data: dispute({ status: 'overturned' }), error: null });
      expect(await settleRewards(upheld)).toEqual({ paid: 0, pending: 0 });
      m.getDisputeById.mockResolvedValue({ data: dispute({ status: 'upheld' }), error: null });
      expect(await settleRewards({ ...upheld, resolved_by: 'admin_override' })).toEqual({ paid: 0, pending: 0 });
      expect(m.claimReward).not.toHaveBeenCalled();
    });
    it('a zero share settles without claiming', async () => {
      const r = await settleRewards(upheld, { ...getGovernanceParams({}), rewardShareBps: 0 });
      expect(r).toEqual({ paid: 0, pending: 0 });
      expect(m.claimReward).not.toHaveBeenCalled();
      expect(m.markRewardsSettled).toHaveBeenCalled();
    });
  });
});

describe('admin override', () => {
  it('writes the audit entry with the reason BEFORE resolving', async () => {
    m.getGovernance.mockResolvedValue({ data: gov({ state: 'escalated' }), error: null });
    m.listVotes.mockResolvedValue({ data: votes([ME, 'uphold']), error: null });
    const order: string[] = [];
    m.writeAudit.mockImplementation(async () => (order.push('audit'), { error: null }));
    m.resolveDispute.mockImplementation(async () => (order.push('resolve'), { status: 'resolved', outcome: 'overturned' }));
    const r = await adminOverride({ disputeId: DID, decision: 'overturn', reason: 'clear evidence' });
    expect(r.status).toBe('resolved');
    expect(order).toEqual(['audit', 'resolve']);
    expect(m.writeAudit).toHaveBeenCalledWith(
      DID,
      'admin_override',
      'admin',
      expect.objectContaining({ reason: 'clear evidence', decision: 'overturn' })
    );
    expect(m.updateGovernanceState).toHaveBeenCalledWith(
      DID,
      expect.anything(),
      expect.objectContaining({ resolved_by: 'admin_override' })
    );
  });
  it('does not resolve when the audit write fails', async () => {
    m.getGovernance.mockResolvedValue({ data: null, error: null });
    m.writeAudit.mockResolvedValue({ error: new Error('db') });
    expect(await adminOverride({ disputeId: DID, decision: 'uphold', reason: 'because' })).toEqual({ status: 'audit_failed' });
    expect(m.resolveDispute).not.toHaveBeenCalled();
  });
  it('works for disputes without a governance record (flag enabled later)', async () => {
    m.getGovernance.mockResolvedValue({ data: null, error: null });
    m.resolveDispute.mockResolvedValue({ status: 'resolved', outcome: 'upheld' });
    expect((await adminOverride({ disputeId: DID, decision: 'uphold', reason: 'because' })).status).toBe('resolved');
  });
});

describe('admin and cron routes', () => {
  const adminHeaders = { 'x-admin-key': 'adminkey' };
  it('admin route needs the admin key and the flags', async () => {
    const body = { action: 'override', disputeId: DID, decision: 'uphold', reason: 'because' };
    expect((await adminPost(req('/api/admin/governance', { body }))).status).toBe(401);
    m.getGovernance.mockResolvedValue({ data: null, error: null });
    m.resolveDispute.mockResolvedValue({ status: 'resolved', outcome: 'upheld' });
    expect((await adminPost(req('/api/admin/governance', { body, headers: adminHeaders }))).status).toBe(200);
    expect(
      (await adminPost(req('/api/admin/governance', { body: { ...body, reason: '' }, headers: adminHeaders }))).status
    ).toBe(400);
    process.env.FEATURE_GOVERNANCE = 'false';
    expect((await adminPost(req('/api/admin/governance', { body, headers: adminHeaders }))).status).toBe(404);
  });
  it('cron requires CRON_SECRET and is a no-op with the flag off', async () => {
    expect((await cronGet(req('/api/cron/resolve-disputes'))).status).toBe(401);
    expect((await cronGet(req('/api/cron/resolve-disputes', { headers: { authorization: 'Bearer wrong' } }))).status).toBe(401);
    process.env.FEATURE_GOVERNANCE = 'false';
    const res = await cronGet(req('/api/cron/resolve-disputes', { headers: { authorization: 'Bearer cronsecret' } }));
    expect(await res.json()).toEqual({ success: true, skipped: true });
    expect(m.listOpenDisputes).not.toHaveBeenCalled();
  });
  it('cron runs a cycle when authorised', async () => {
    m.listOpenDisputes.mockResolvedValue({ data: [], error: null });
    m.listGovernanceByState.mockResolvedValue({ data: [], error: null });
    m.listGovernanceNeedingRewards.mockResolvedValue({ data: [], error: null });
    const res = await cronGet(req('/api/cron/resolve-disputes', { headers: { authorization: 'Bearer cronsecret' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, drawn: 0, resolved: 0, errors: 0 });
  });
});

describe('runGovernanceCycle', () => {
  it('draws only for open disputes without a governance record', async () => {
    m.listOpenDisputes.mockResolvedValue({ data: [dispute({ id: 'has' }), dispute({ id: 'new' })], error: null });
    m.listGovernanceByIds.mockResolvedValue({ data: [gov({ dispute_id: 'has' })], error: null });
    m.getGoalById.mockResolvedValue({ data: { id: 'g1', wallet_address: OWNER }, error: null });
    m.getCompletedGoalCounts.mockResolvedValue({ data: new Map(), error: null });
    m.getWalletsWithPendingDispute.mockResolvedValue({ data: new Set(), error: null });
    m.getConflictedWallets.mockResolvedValue({ data: new Set(), error: null });
    m.createGovernanceWithPanel.mockResolvedValue({ created: true, duplicate: false, error: null });
    m.listGovernanceByState.mockResolvedValue({ data: [], error: null });
    m.listGovernanceNeedingRewards.mockResolvedValue({ data: [], error: null });
    const s = await runGovernanceCycle(NOW);
    expect(s.adminFallback).toBe(1);
    expect(m.createGovernanceWithPanel).toHaveBeenCalledTimes(1);
    expect(m.createGovernanceWithPanel.mock.calls[0][0].dispute_id).toBe('new');
  });
});
