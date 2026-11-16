import { describe, it, expect } from 'vitest';
import { computeTeamRewards, type TeamMemberGoal } from '@/lib/teams/rewards';
import {
  generateInviteCode,
  isValidInviteCode,
  normalizeInviteCode,
  INVITE_CODE_LENGTH,
} from '@/lib/teams/invite';
import { canJoinTeam, canStakeOnTeamGoal, MAX_TEAM_SIZE, isOwner } from '@/lib/teams/membership';
import { evaluateSettlement } from '@/lib/teams/settlement';
import { buildTeamGoalProgress } from '@/lib/teams/progress';
import { joinTeamSchema, createTeamGoalSchema } from '@/lib/validation/teams-schemas';

const m = (goalId: string, wallet: string, stake: number): TeamMemberGoal => ({ goalId, wallet, stake });
const sum = (xs: Array<{ amount: number }>) => xs.reduce((s, x) => s + x.amount, 0);

describe('computeTeamRewards', () => {
  it('splits the team pool pro rata among completers', () => {
    const r = computeTeamRewards([m('a', 'A', 1), m('b', 'B', 3)], [m('c', 'C', 2), m('d', 'D', 2)]);
    expect(r.teamPool).toBe(4);
    expect(r.rewards).toEqual([
      { goalId: 'a', recipient: 'A', amount: 1 },
      { goalId: 'b', recipient: 'B', amount: 3 },
    ]);
    expect(r.remainderToGlobal).toBe(0);
  });

  it('floors to 4 decimals and never exceeds the pool', () => {
    const r = computeTeamRewards([m('a', 'A', 1), m('b', 'B', 1), m('c', 'C', 1)], [m('x', 'X', 1)]);
    expect(r.rewards.every((p) => p.amount === 0.3333)).toBe(true);
    expect(sum(r.rewards)).toBeLessThanOrEqual(1);
    expect(r.remainderToGlobal).toBeCloseTo(0.0001, 10);
    expect(r.distributed + r.remainderToGlobal).toBeCloseTo(r.teamPool, 10);
  });

  it('sends the whole pool to global when nobody completed', () => {
    const r = computeTeamRewards([], [m('x', 'X', 0.5), m('y', 'Y', 0.5)]);
    expect(r.rewards).toEqual([]);
    expect(r.distributed).toBe(0);
    expect(r.remainderToGlobal).toBe(1);
  });

  it('pays nothing when nobody failed', () => {
    const r = computeTeamRewards([m('a', 'A', 1), m('b', 'B', 1)], []);
    expect(r).toEqual({ teamPool: 0, distributed: 0, remainderToGlobal: 0, rewards: [] });
  });

  it('handles a single member (completed or failed)', () => {
    expect(computeTeamRewards([m('a', 'A', 1)], []).rewards).toEqual([]);
    const lost = computeTeamRewards([], [m('a', 'A', 1)]);
    expect(lost.remainderToGlobal).toBe(1);
  });

  it('gives one completer the entire pool', () => {
    const r = computeTeamRewards([m('a', 'A', 1)], [m('b', 'B', 1), m('c', 'C', 1), m('d', 'D', 1)]);
    expect(r.rewards).toEqual([{ goalId: 'a', recipient: 'A', amount: 3 }]);
    expect(r.remainderToGlobal).toBe(0);
  });

  it('weights by stake', () => {
    const r = computeTeamRewards([m('a', 'A', 1), m('b', 'B', 2)], [m('c', 'C', 3)]);
    expect(r.rewards.map((p) => p.amount)).toEqual([1, 2]);
  });

  it('is stable for float-unfriendly stakes', () => {
    const r = computeTeamRewards([m('a', 'A', 0.1), m('b', 'B', 0.2)], [m('c', 'C', 0.3)]);
    expect(r.rewards.map((p) => p.amount)).toEqual([0.1, 0.2]);
    expect(r.teamPool).toBe(0.3);
  });

  it('does not lose precision for very large stakes', () => {
    const winners = Array.from({ length: 20 }, (_, i) => m(`w${i}`, `W${i}`, 1000));
    const losers = Array.from({ length: 20 }, (_, i) => m(`l${i}`, `L${i}`, 1000));
    const r = computeTeamRewards(winners, losers);
    expect(sum(r.rewards)).toBeLessThanOrEqual(20000);
    expect(r.rewards[0].amount).toBe(1000);
  });

  it('ignores zero or negative stakes', () => {
    const r = computeTeamRewards([m('a', 'A', 0), m('b', 'B', 1)], [m('c', 'C', 1), m('d', 'D', -5)]);
    expect(r.rewards).toEqual([{ goalId: 'b', recipient: 'B', amount: 1 }]);
    expect(r.teamPool).toBe(1);
  });
});

describe('invite codes', () => {
  it('generates valid, unambiguous, distinct codes', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateInviteCode()));
    expect(codes.size).toBe(200);
    for (const c of codes) {
      expect(c).toHaveLength(INVITE_CODE_LENGTH);
      expect(isValidInviteCode(c)).toBe(true);
      expect(c).not.toMatch(/[01OIL]/);
    }
  });
  it('normalizes and validates', () => {
    expect(normalizeInviteCode(' abcde-fghj2 ')).toBe('ABCDEFGHJ2');
    expect(isValidInviteCode('ABCDEFGHJ2')).toBe(true);
    expect(isValidInviteCode('ABCDEFGHJ')).toBe(false);
    expect(isValidInviteCode('ABCDEFGHJ0')).toBe(false);
    expect(isValidInviteCode('abcdefghj2')).toBe(false);
  });
  it('schema normalizes input', () => {
    expect(joinTeamSchema.parse({ inviteCode: 'abcde-fghj2' }).inviteCode).toBe('ABCDEFGHJ2');
    expect(joinTeamSchema.safeParse({ inviteCode: 'nope' }).success).toBe(false);
  });
});

describe('membership rules', () => {
  const members = [{ wallet_address: 'A', role: 'owner' as const }];
  it('blocks duplicate joins and full teams', () => {
    expect(canJoinTeam(members, 'B')).toEqual({ ok: true });
    expect(canJoinTeam(members, 'A')).toEqual({ ok: false, reason: 'already_member' });
    const full = Array.from({ length: MAX_TEAM_SIZE }, (_, i) => ({ wallet_address: `W${i}`, role: 'member' as const }));
    expect(canJoinTeam(full, 'new')).toEqual({ ok: false, reason: 'team_full' });
  });
  it('owner check', () => {
    expect(isOwner({ owner_wallet: 'A' }, 'A')).toBe(true);
    expect(isOwner({ owner_wallet: 'A' }, 'B')).toBe(false);
  });
  it('stake rules', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const base = { members, wallet: 'A', teamGoal: { status: 'open', deadline: future }, alreadyStaked: false };
    expect(canStakeOnTeamGoal(base)).toEqual({ ok: true });
    expect(canStakeOnTeamGoal({ ...base, wallet: 'Z' })).toEqual({ ok: false, reason: 'not_member' });
    expect(canStakeOnTeamGoal({ ...base, alreadyStaked: true })).toEqual({ ok: false, reason: 'already_staked' });
    expect(canStakeOnTeamGoal({ ...base, teamGoal: { status: 'settled', deadline: future } })).toEqual({
      ok: false,
      reason: 'team_goal_closed',
    });
    expect(
      canStakeOnTeamGoal({ ...base, teamGoal: { status: 'open', deadline: new Date(Date.now() - 1000).toISOString() } })
    ).toEqual({ ok: false, reason: 'deadline_passed' });
  });
});

describe('evaluateSettlement', () => {
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const g = (id: string, status: string, sig = 'sig') => ({
    id,
    wallet_address: id.toUpperCase(),
    stake_amount: 1,
    stake_tx_signature: sig,
    status,
  });
  it('waits for the deadline', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(evaluateSettlement({ deadline: future }, [g('a', 'completed')])).toMatchObject({
      ready: false,
      reason: 'deadline_not_reached',
    });
  });
  it('refuses while any staked goal is non-final', () => {
    for (const status of ['active', 'pending_validation', 'rejected_appealable', 'disputed']) {
      const r = evaluateSettlement({ deadline: past }, [g('a', 'completed'), g('b', status)]);
      expect(r).toMatchObject({ ready: false, reason: 'non_final_goals', blockingGoalIds: ['b'] });
    }
  });
  it('ignores goals that never staked', () => {
    const r = evaluateSettlement({ deadline: past }, [g('a', 'completed'), g('b', 'pending_validation', 'pending')]);
    expect(r.ready).toBe(true);
  });
  it('splits completed and failed', () => {
    const r = evaluateSettlement({ deadline: past }, [g('a', 'completed'), g('b', 'failed')]);
    expect(r).toMatchObject({
      ready: true,
      completed: [{ goalId: 'a', wallet: 'A', stake: 1 }],
      failed: [{ goalId: 'b', wallet: 'B', stake: 1 }],
    });
  });
});

describe('progress', () => {
  it('summarizes without leaking goal detail', () => {
    const p = buildTeamGoalProgress(
      ['A', 'B', 'C', 'D'],
      [
        { wallet_address: 'A', status: 'completed', stake_tx_signature: 's' },
        { wallet_address: 'B', status: 'active', stake_tx_signature: 's' },
        { wallet_address: 'C', status: 'pending_validation', stake_tx_signature: 'pending' },
      ]
    );
    expect(p.members.map((x) => x.status)).toEqual(['completed', 'active', 'awaiting_stake', 'not_staked']);
    expect(p).toMatchObject({ completed: 1, staked: 2, total: 4 });
  });
});

describe('createTeamGoalSchema', () => {
  const ok = {
    teamId: '3f2b8c1e-5d4a-4e8b-9c1d-2a3b4c5d6e7f',
    title: 't',
    description: 'd',
    category: 'work',
    deadline: new Date(Date.now() + 86_400_000).toISOString(),
    stakePerMember: 0.5,
  };
  it('accepts valid and rejects bad input', () => {
    expect(createTeamGoalSchema.safeParse(ok).success).toBe(true);
    expect(createTeamGoalSchema.safeParse({ ...ok, stakePerMember: 0 }).success).toBe(false);
    expect(createTeamGoalSchema.safeParse({ ...ok, stakePerMember: 0.00001 }).success).toBe(false);
    expect(createTeamGoalSchema.safeParse({ ...ok, deadline: '2020-01-01T00:00:00Z' }).success).toBe(false);
    expect(createTeamGoalSchema.safeParse({ ...ok, teamId: 'x' }).success).toBe(false);
  });
});
