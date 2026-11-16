import { computeRewardPayouts } from '@/lib/solana/payouts';
import type { Goal } from '@/types';

/**
 * Global pool composition (pure).
 *
 * Goals linked to a team goal (team_goal_id set) are settled by team
 * settlement, so they never appear in the global winner/loser sets. Each
 * settled team goal contributes its recorded `remainder_to_global` to the
 * global pool of its deadline day exactly once.
 */

const SCALE = 1e4;
const toUnits = (n: number) => Math.round(n * SCALE);
const fromUnits = (u: number) => u / SCALE;

export function isTeamGoal(g: { team_goal_id?: string | null }): boolean {
  return g.team_goal_id !== null && g.team_goal_id !== undefined;
}

/** Drops team member goals. Goals with a null/absent team_goal_id are returned untouched (same array order and objects). */
export function excludeTeamGoals<T extends { team_goal_id?: string | null }>(goals: T[]): T[] {
  return goals.filter((g) => !isTeamGoal(g));
}

export interface TeamRemainderRow {
  id: string;
  status: string;
  remainder_to_global: number | string | null;
}

/**
 * Sum of recorded remainders, counting each team goal id once even if the
 * input repeats a row. Only settled goals with a recorded remainder count.
 */
export function sumTeamRemainders(rows: TeamRemainderRow[]): number {
  const seen = new Set<string>();
  let units = 0;
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    if (r.status !== 'settled' || r.remainder_to_global === null) continue;
    const u = toUnits(Number(r.remainder_to_global));
    if (Number.isFinite(u) && u > 0) units += u;
  }
  return fromUnits(units);
}

/** Team goals of the day that are not settled yet (their remainder is not final). */
export function unsettledTeamGoalIds(rows: TeamRemainderRow[]): string[] {
  return rows.filter((r) => r.status !== 'settled').map((r) => r.id);
}

export interface GlobalPool {
  completed: Goal[];
  failed: Goal[];
  failedStake: number;
  extraPool: number;
  totalPool: number;
}

/** Splits a day's goals into the global winner/loser sets and the pool size. */
export function composeGlobalPool(goalsForDay: Goal[], teamRemainder = 0): GlobalPool {
  const goals = excludeTeamGoals(goalsForDay);
  const completed = goals.filter((g) => g.status === 'completed');
  const failed = goals.filter((g) => g.status === 'failed');
  const failedStake = failed.reduce((s, g) => s + g.stake_amount, 0);
  const extraPool = teamRemainder > 0 ? teamRemainder : 0;
  return { completed, failed, failedStake, extraPool, totalPool: failedStake + extraPool };
}

/**
 * Per-goal global rewards. With no extra pool this IS computeRewardPayouts, so
 * behaviour for non-team deadlines is unchanged. Otherwise the team remainder
 * is added to the losers' pool and split pro rata among global winners.
 */
export function computeGlobalRewardPayouts(
  completed: Goal[],
  failed: Goal[],
  extraPool = 0
): Array<{ goalId: string; recipient: string; amount: number }> {
  if (!(extraPool > 0)) return computeRewardPayouts(completed, failed);
  const winners = completed.reduce((s, g) => s + g.stake_amount, 0);
  const pool = failed.reduce((s, g) => s + g.stake_amount, 0) + extraPool;
  if (winners <= 0 || pool <= 0) return [];
  return completed
    .map((g) => ({
      goalId: g.id,
      recipient: g.wallet_address,
      amount: Math.floor((g.stake_amount / winners) * pool * SCALE) / SCALE,
    }))
    .filter((p) => p.amount > 0);
}
