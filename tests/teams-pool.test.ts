import { describe, it, expect } from 'vitest';
import { computeRewardPayouts } from '@/lib/solana/payouts';
import {
  composeGlobalPool,
  computeGlobalRewardPayouts,
  excludeTeamGoals,
  sumTeamRemainders,
  unsettledTeamGoalIds,
} from '@/lib/teams/pool';
import { computeTeamRewards } from '@/lib/teams/rewards';
import type { Goal } from '@/types';

const goal = (id: string, status: Goal['status'], stake: number, team?: string | null): Goal =>
  ({
    id,
    wallet_address: `W-${id}`,
    title: id,
    description: id,
    deadline: '2026-12-01T10:00:00.000Z',
    stake_amount: stake,
    stake_tx_signature: 'sig',
    status,
    category: 'work',
    created_at: '',
    updated_at: '',
    ...(team === undefined ? {} : { team_goal_id: team }),
  }) as Goal;

describe('global pool composition', () => {
  const day = [
    goal('a', 'completed', 1),
    goal('b', 'failed', 2, null),
    goal('t1', 'completed', 1, 'TG'),
    goal('t2', 'failed', 5, 'TG'),
  ];

  it('never puts a team member goal in the global winner/loser sets', () => {
    const pool = composeGlobalPool(day, 0);
    expect(pool.completed.map((g) => g.id)).toEqual(['a']);
    expect(pool.failed.map((g) => g.id)).toEqual(['b']);
    expect(pool.totalPool).toBe(2);
    const payouts = computeGlobalRewardPayouts(pool.completed, pool.failed, pool.extraPool);
    expect(payouts.map((p) => p.goalId)).toEqual(['a']);
    expect(payouts[0].amount).toBe(2);
  });

  it('a team member cannot be paid both team and global rewards', () => {
    const members = day.filter((g) => g.team_goal_id === 'TG');
    const team = computeTeamRewards(
      members.filter((g) => g.status === 'completed').map((g) => ({ goalId: g.id, wallet: g.wallet_address, stake: g.stake_amount })),
      members.filter((g) => g.status === 'failed').map((g) => ({ goalId: g.id, wallet: g.wallet_address, stake: g.stake_amount }))
    );
    const pool = composeGlobalPool(day, team.remainderToGlobal);
    const globalIds = new Set(computeGlobalRewardPayouts(pool.completed, pool.failed, pool.extraPool).map((p) => p.goalId));
    for (const r of team.rewards) expect(globalIds.has(r.goalId)).toBe(false);
    // failed team stake is distributed once: entirely inside the team
    expect(team.distributed + team.remainderToGlobal).toBe(5);
    expect(pool.totalPool).toBe(2 + team.remainderToGlobal);
  });

  it('adds the remainder when nobody on the team completed, and counts it once', () => {
    const noWinner = [goal('a', 'completed', 1), goal('t2', 'failed', 3, 'TG')];
    const team = computeTeamRewards([], [{ goalId: 't2', wallet: 'W-t2', stake: 3 }]);
    expect(team.remainderToGlobal).toBe(3);
    const rows = [
      { id: 'TG', status: 'settled', remainder_to_global: team.remainderToGlobal },
      { id: 'TG', status: 'settled', remainder_to_global: team.remainderToGlobal }, // duplicate row
    ];
    const extra = sumTeamRemainders(rows);
    expect(extra).toBe(3);
    const pool = composeGlobalPool(noWinner, extra);
    expect(pool.totalPool).toBe(3);
    const payouts = computeGlobalRewardPayouts(pool.completed, pool.failed, pool.extraPool);
    expect(payouts).toEqual([{ goalId: 'a', recipient: 'W-a', amount: 3 }]);
    // rerun is deterministic: same pool, same amounts
    expect(computeGlobalRewardPayouts(pool.completed, pool.failed, pool.extraPool)).toEqual(payouts);
  });

  it('ignores unsettled or unrecorded remainders and reports unsettled goals', () => {
    const rows = [
      { id: 'x', status: 'open', remainder_to_global: null },
      { id: 'y', status: 'settled', remainder_to_global: null },
      { id: 'z', status: 'settled', remainder_to_global: '0.5000' },
    ];
    expect(sumTeamRemainders(rows)).toBe(0.5);
    expect(unsettledTeamGoalIds(rows)).toEqual(['x']);
  });

  it('is byte-for-byte unchanged for goals without team_goal_id', () => {
    const plain = [goal('a', 'completed', 1.5), goal('b', 'completed', 0.5), goal('c', 'failed', 0.3333), goal('d', 'failed', 1, null)];
    expect(excludeTeamGoals(plain)).toEqual(plain);
    const pool = composeGlobalPool(plain, 0);
    expect(pool.extraPool).toBe(0);
    expect(computeGlobalRewardPayouts(pool.completed, pool.failed, pool.extraPool)).toEqual(
      computeRewardPayouts(plain.filter((g) => g.status === 'completed'), plain.filter((g) => g.status === 'failed'))
    );
  });

  it('never pays more than the pool', () => {
    const completed = [goal('a', 'completed', 1), goal('b', 'completed', 1), goal('c', 'completed', 1)];
    const failed = [goal('f', 'failed', 1)];
    const total = computeGlobalRewardPayouts(completed, failed, 0.0001).reduce((s, p) => s + Math.round(p.amount * 1e4), 0);
    expect(total).toBeLessThanOrEqual(Math.round(1.0001 * 1e4));
  });
});
