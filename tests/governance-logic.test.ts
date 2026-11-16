import { describe, expect, it } from 'vitest';
import {
  bondToLamports,
  checkCanVote,
  computeRewardSplit,
  computeVotingEnd,
  countVotes,
  drawPanel,
  isResolutionDue,
  isVotingOpen,
  majorityVoters,
  planPanel,
  selectEligible,
  statsDeltas,
  tallyVotes,
  type Vote,
} from '@/lib/governance/logic';
import { clampInt, getGovernanceParams } from '@/lib/governance/params';
import { buildAdminGovernanceView, buildAssignmentView, pseudonym } from '@/lib/governance/views';
import { adminGovernanceSchema, castVoteSchema } from '@/lib/validation/governance-schemas';

const v = (vote: Vote) => ({ vote });

describe('params', () => {
  it('uses defaults', () => {
    expect(getGovernanceParams({})).toEqual({
      minCompletedGoals: 3,
      panelSize: 5,
      quorum: 3,
      votingWindowHours: 48,
      rewardShareBps: 5000,
    });
  });
  it('clamps and ignores garbage', () => {
    expect(clampInt('abc', 5, 1, 10)).toBe(5);
    expect(clampInt('', 5, 1, 10)).toBe(5);
    expect(clampInt('99', 5, 1, 10)).toBe(10);
    expect(clampInt('-4', 5, 1, 10)).toBe(1);
    expect(clampInt('3.9', 5, 1, 10)).toBe(3);
    const p = getGovernanceParams({
      GOVERNANCE_PANEL_SIZE: '1',
      GOVERNANCE_QUORUM: '50',
      GOVERNANCE_VOTING_WINDOW_HOURS: '100000',
      GOVERNANCE_REWARD_SHARE_BPS: '99999',
      GOVERNANCE_MIN_COMPLETED_GOALS: '0',
    });
    expect(p.panelSize).toBe(3);
    expect(p.quorum).toBe(3); // never above the panel size
    expect(p.votingWindowHours).toBe(168);
    expect(p.rewardShareBps).toBe(10_000);
    expect(p.minCompletedGoals).toBe(1);
  });
});

describe('eligibility', () => {
  const base = {
    completedCounts: new Map([
      ['owner', 10],
      ['a', 3],
      ['b', 2],
      ['c', 9],
      ['d', 5],
      ['e', 4],
    ]),
    ownerWallet: 'owner',
    walletsWithPendingDispute: new Set<string>(),
    conflictedWallets: new Set<string>(),
    minCompletedGoals: 3,
  };
  it('requires the minimum completed goals and excludes the owner', () => {
    expect(selectEligible(base)).toEqual(['a', 'c', 'd', 'e']);
  });
  it('excludes wallets with their own pending dispute', () => {
    expect(selectEligible({ ...base, walletsWithPendingDispute: new Set(['c']) })).toEqual(['a', 'd', 'e']);
  });
  it('excludes team/org mates', () => {
    expect(selectEligible({ ...base, conflictedWallets: new Set(['a', 'e']) })).toEqual(['c', 'd']);
  });
  it('threshold is inclusive and configurable', () => {
    expect(selectEligible({ ...base, minCompletedGoals: 9 })).toEqual(['c']);
    expect(selectEligible({ ...base, minCompletedGoals: 100 })).toEqual([]);
  });
});

describe('panel draw', () => {
  const pool = Array.from({ length: 20 }, (_, i) => `w${i}`);
  it('draws unique wallets from the pool', () => {
    for (let i = 0; i < 50; i++) {
      const p = drawPanel(pool, 5);
      expect(p).toHaveLength(5);
      expect(new Set(p).size).toBe(5);
      for (const w of p) expect(pool).toContain(w);
    }
  });
  it('never exceeds the pool and ignores duplicates', () => {
    expect(drawPanel(['a', 'b', 'a'], 5).sort()).toEqual(['a', 'b']);
    expect(drawPanel([], 5)).toEqual([]);
    expect(drawPanel(pool, 0)).toEqual([]);
    expect(drawPanel(pool, -3)).toEqual([]);
  });
  it('does not mutate its input', () => {
    const copy = [...pool];
    drawPanel(pool, 5);
    expect(pool).toEqual(copy);
  });
  it('is deterministic for a given rng (reproducible) and uses it', () => {
    const rng = (max: number) => max - 1; // always last
    expect(drawPanel(['a', 'b', 'c', 'd'], 2, rng)).toEqual(drawPanel(['a', 'b', 'c', 'd'], 2, rng));
    expect(drawPanel(['a', 'b', 'c', 'd'], 2, () => 0)).toEqual(['a', 'b']);
  });
  it('is roughly uniform with crypto randomness', () => {
    const counts = new Map<string, number>();
    const N = 6000;
    const small = ['a', 'b', 'c', 'd', 'e', 'f'];
    for (let i = 0; i < N; i++) for (const w of drawPanel(small, 2)) counts.set(w, (counts.get(w) ?? 0) + 1);
    const expected = (N * 2) / small.length; // 2000
    for (const w of small) expect(Math.abs((counts.get(w) ?? 0) - expected)).toBeLessThan(expected * 0.15);
  });
});

describe('panel plan', () => {
  it('falls back to the admin below quorum and records why', () => {
    const plan = planPanel(2, { panelSize: 5, quorum: 3 });
    expect(plan).toEqual({ mode: 'admin', fallbackReason: 'insufficient_eligible_voters:2<3' });
  });
  it('draws a smaller panel when eligible >= quorum but < size', () => {
    expect(planPanel(3, { panelSize: 5, quorum: 3 })).toEqual({ mode: 'panel', panelSize: 3 });
    expect(planPanel(40, { panelSize: 5, quorum: 3 })).toEqual({ mode: 'panel', panelSize: 5 });
  });
});

describe('voting window and vote checks', () => {
  const end = '2026-01-03T00:00:00.000Z';
  const open = new Date('2026-01-02T23:59:59.000Z');
  const closed = new Date('2026-01-03T00:00:00.000Z');
  const ok = {
    isPanelist: true,
    state: 'voting' as const,
    disputeOpen: true,
    votingEndsAt: end,
    existingVote: null,
    vote: 'uphold' as Vote,
    now: open,
  };
  it('window is 48h by default from the draw', () => {
    expect(computeVotingEnd(new Date('2026-01-01T00:00:00Z'), 48).toISOString()).toBe(end);
    expect(isVotingOpen(end, open)).toBe(true);
    expect(isVotingOpen(end, closed)).toBe(false);
    expect(isVotingOpen(null, open)).toBe(false);
    expect(isVotingOpen('garbage', open)).toBe(false);
  });
  it('allows a panelist inside the window', () => {
    expect(checkCanVote(ok)).toEqual({ ok: true, replay: false });
  });
  it('refuses non-panelists', () => {
    expect(checkCanVote({ ...ok, isPanelist: false })).toEqual({ ok: false, reason: 'not_panelist' });
    expect(checkCanVote({ ...ok, state: null })).toEqual({ ok: false, reason: 'not_panelist' });
  });
  it('refuses after the window and when not voting', () => {
    expect(checkCanVote({ ...ok, now: closed })).toEqual({ ok: false, reason: 'window_closed' });
    expect(checkCanVote({ ...ok, state: 'escalated' })).toEqual({ ok: false, reason: 'not_voting' });
    expect(checkCanVote({ ...ok, state: 'resolved' })).toEqual({ ok: false, reason: 'not_voting' });
    expect(checkCanVote({ ...ok, disputeOpen: false })).toEqual({ ok: false, reason: 'not_voting' });
  });
  it('one vote only: identical replay is idempotent, a different vote is refused', () => {
    expect(checkCanVote({ ...ok, existingVote: 'uphold' })).toEqual({ ok: true, replay: true });
    expect(checkCanVote({ ...ok, existingVote: 'overturn' })).toEqual({ ok: false, reason: 'already_voted' });
    // replay stays idempotent after the window
    expect(checkCanVote({ ...ok, existingVote: 'uphold', now: closed })).toEqual({ ok: true, replay: true });
  });
});

describe('tally', () => {
  it('majority of cast votes decides with quorum', () => {
    expect(tallyVotes([v('overturn'), v('overturn'), v('uphold')], 3)).toMatchObject({
      kind: 'decision',
      decision: 'overturn',
    });
    expect(tallyVotes([v('uphold'), v('uphold'), v('overturn')], 3)).toMatchObject({
      kind: 'decision',
      decision: 'uphold',
    });
  });
  it('missing quorum escalates', () => {
    expect(tallyVotes([v('uphold'), v('uphold')], 3)).toMatchObject({ kind: 'escalate', reason: 'no_quorum' });
    expect(tallyVotes([], 3)).toMatchObject({ kind: 'escalate', reason: 'no_quorum' });
  });
  it('ties escalate', () => {
    expect(tallyVotes([v('uphold'), v('overturn'), v('uphold'), v('overturn')], 3)).toMatchObject({
      kind: 'escalate',
      reason: 'tie',
    });
  });
  it('quorum counts cast votes, not panel size (4 of 5 missing)', () => {
    expect(tallyVotes([v('overturn'), v('overturn'), v('overturn')], 3)).toMatchObject({ kind: 'decision' });
  });
  it('counts', () => {
    expect(countVotes([v('uphold'), v('overturn'), v('uphold')])).toEqual({ overturn: 1, uphold: 2, cast: 3 });
  });
});

describe('resolution due', () => {
  const end = '2026-01-03T00:00:00.000Z';
  const before = new Date('2026-01-02T00:00:00Z');
  const after = new Date('2026-01-03T00:00:01Z');
  it('due when all votes are in, or the window closed', () => {
    expect(isResolutionDue({ votingEndsAt: end, panelSize: 5, castVotes: 5, now: before })).toBe(true);
    expect(isResolutionDue({ votingEndsAt: end, panelSize: 5, castVotes: 4, now: before })).toBe(false);
    expect(isResolutionDue({ votingEndsAt: end, panelSize: 5, castVotes: 0, now: after })).toBe(true);
    expect(isResolutionDue({ votingEndsAt: null, panelSize: 0, castVotes: 0, now: after })).toBe(false);
  });
});

describe('reward split', () => {
  it('splits 50% of the bond equally in integer lamports', () => {
    expect(computeRewardSplit(1_000_000, 3, 5000)).toEqual({
      poolLamports: 500_000,
      perVoterLamports: 166_666,
      totalLamports: 499_998,
    });
  });
  it('never exceeds the bond and leaves the remainder', () => {
    for (const bond of [1, 2, 3, 7, 999, 1_000_001, 25_000_000, 12_345_678_901]) {
      for (const winners of [1, 2, 3, 4, 5, 7, 25]) {
        for (const bps of [0, 1, 3333, 5000, 9999, 10_000]) {
          const s = computeRewardSplit(bond, winners, bps);
          expect(Number.isInteger(s.perVoterLamports)).toBe(true);
          expect(s.totalLamports).toBeLessThanOrEqual(s.poolLamports);
          expect(s.poolLamports).toBeLessThanOrEqual(bond);
          expect(s.totalLamports).toBeLessThanOrEqual(bond);
          expect(s.perVoterLamports * winners).toBe(s.totalLamports);
        }
      }
    }
  });
  it('handles degenerate input safely', () => {
    expect(computeRewardSplit(100, 0, 5000).totalLamports).toBe(0);
    expect(computeRewardSplit(-5, 3, 5000).totalLamports).toBe(0);
    expect(computeRewardSplit(100, 3, 999_999).poolLamports).toBe(100); // bps clamped
    expect(computeRewardSplit(5, 5, 5000).perVoterLamports).toBe(0);
  });
  it('converts bond SOL to lamports', () => {
    expect(bondToLamports(0.0125)).toBe(12_500_000);
  });
});

describe('majority voters and stats', () => {
  const votes = [
    { voter_wallet: 'a', vote: 'uphold' as Vote },
    { voter_wallet: 'b', vote: 'uphold' as Vote },
    { voter_wallet: 'c', vote: 'overturn' as Vote },
  ];
  it('lists voters with the outcome', () => {
    expect(majorityVoters(votes, 'uphold')).toEqual(['a', 'b']);
    expect(majorityVoters(votes, 'overturn')).toEqual(['c']);
  });
  it('counts cast, agreed and missed votes (no slashing)', () => {
    expect(statsDeltas(['a', 'b', 'c', 'd'], votes, 'uphold')).toEqual([
      { wallet: 'a', cast: 1, agreed: 1, missed: 0 },
      { wallet: 'b', cast: 1, agreed: 1, missed: 0 },
      { wallet: 'c', cast: 1, agreed: 0, missed: 0 },
      { wallet: 'd', cast: 0, agreed: 0, missed: 1 },
    ]);
  });
});

describe('sealed vote visibility', () => {
  const OWNER = 'OwnerWalletAddress1111111111111111111111111';
  const OTHER = 'OtherVoterWallet22222222222222222222222222';
  const ME = 'MyWallet3333333333333333333333333333333333';
  const src = (state: 'voting' | 'resolved') => ({
    dispute: { id: 'd1', reason: 'The AI was wrong', extra_image_url: null, created_at: '2026-01-01' },
    governance: { state, voting_ends_at: '2026-01-03T00:00:00Z', decision: state === 'resolved' ? ('overturn' as Vote) : null },
    goal: { title: 'Run', description: 'Run 5k', wallet_address: OWNER },
    proof: { text_description: 'ran', image_url: null, ai_verdict: 'rejected', ai_confidence: 40, ai_reasoning: 'blurry' },
    ownVote: { vote: 'uphold' as Vote, reason: 'mine' },
    allVotes: [
      { voter_wallet: ME, vote: 'uphold' as Vote, reason: 'mine' },
      { voter_wallet: OTHER, vote: 'overturn' as Vote, reason: 'secret reason' },
    ],
  });

  it('while voting: only my own vote, no tally, no other voters, no owner wallet', () => {
    const view = buildAssignmentView(src('voting'), 'secret');
    const json = JSON.stringify(view);
    expect(view.myVote).toBe('uphold');
    expect(view.result).toBeNull();
    expect(json).not.toContain(OWNER);
    expect(json).not.toContain(OTHER);
    expect(json).not.toContain('secret reason');
    expect(json).not.toContain('overturn');
  });
  it('after resolution: tally and pseudonymous votes, still no wallets', () => {
    const view = buildAssignmentView(src('resolved'), 'secret');
    const json = JSON.stringify(view);
    expect(view.result?.tally).toEqual({ overturn: 1, uphold: 1, cast: 2 });
    expect(json).not.toContain(OWNER);
    expect(json).not.toContain(OTHER);
    expect(json).not.toContain(ME);
    expect(json).not.toContain('secret reason');
  });
  it('pseudonym is stable, short, dispute-scoped and keyed', () => {
    expect(pseudonym('d1', OWNER, 's')).toBe(pseudonym('d1', OWNER, 's'));
    expect(pseudonym('d1', OWNER, 's')).not.toBe(pseudonym('d2', OWNER, 's'));
    expect(pseudonym('d1', OWNER, 's')).not.toBe(pseudonym('d1', OWNER, 't'));
    expect(pseudonym('d1', OWNER, 's')).toMatch(/^Anon-[0-9a-f]{6}$/);
  });
  it('admin view hides the tally until voting is over', () => {
    const g = { dispute_id: 'd1', mode: 'panel', fallback_reason: null, escalated_reason: null, voting_ends_at: null };
    const votes = [v('uphold'), v('overturn')];
    expect(buildAdminGovernanceView({ ...g, state: 'voting' }, votes, 5).tally).toBeNull();
    expect(buildAdminGovernanceView({ ...g, state: 'admin' }, votes, 0).tally).toBeNull();
    expect(buildAdminGovernanceView({ ...g, state: 'escalated' }, votes, 5).tally).toEqual({
      overturn: 1,
      uphold: 1,
      cast: 2,
    });
  });
});

describe('schemas', () => {
  const id = '3f2b8c1e-5a47-4c0e-9d7a-1b2c3d4e5f60';
  it('validates votes', () => {
    expect(castVoteSchema.safeParse({ disputeId: id, vote: 'uphold' }).success).toBe(true);
    expect(castVoteSchema.safeParse({ disputeId: id, vote: 'maybe' }).success).toBe(false);
    expect(castVoteSchema.safeParse({ disputeId: 'x', vote: 'uphold' }).success).toBe(false);
    expect(castVoteSchema.safeParse({ disputeId: id, vote: 'uphold', reason: 'x'.repeat(501) }).success).toBe(false);
  });
  it('validates admin actions', () => {
    expect(adminGovernanceSchema.safeParse({ action: 'run' }).success).toBe(true);
    expect(adminGovernanceSchema.safeParse({ action: 'override', disputeId: id, decision: 'uphold' }).success).toBe(false);
    expect(
      adminGovernanceSchema.safeParse({ action: 'override', disputeId: id, decision: 'uphold', reason: 'clear fraud' }).success
    ).toBe(true);
  });
});
