/**
 * Team-first redistribution (pure math, no I/O).
 *
 * Members who failed forfeit into the TEAM pool first. The pool is split pro
 * rata (by stake) among teammates who completed. Amounts are floored to 4
 * decimals (the payouts.amount precision), so the sum never exceeds the pool.
 * Anything not distributed (rounding dust, or the whole pool when nobody on the
 * team completed) is the remainder that falls through to the global pool,
 * exactly as before teams existed.
 */

export interface TeamMemberGoal {
  goalId: string;
  wallet: string;
  stake: number;
}

export interface TeamReward {
  goalId: string;
  recipient: string;
  amount: number;
}

export interface TeamRewardResult {
  teamPool: number;
  distributed: number;
  remainderToGlobal: number;
  rewards: TeamReward[];
}

const SCALE = 1e4;
const toUnits = (sol: number) => Math.round(sol * SCALE);
const fromUnits = (u: number) => u / SCALE;

export function computeTeamRewards(
  completed: TeamMemberGoal[],
  failed: TeamMemberGoal[]
): TeamRewardResult {
  const poolUnits = failed.reduce((s, g) => s + Math.max(0, toUnits(g.stake)), 0);
  const winners = completed
    .map((g) => ({ ...g, units: Math.max(0, toUnits(g.stake)) }))
    .filter((g) => g.units > 0);
  const winnersTotal = winners.reduce((s, g) => s + g.units, 0);

  if (poolUnits <= 0 || winnersTotal <= 0) {
    return { teamPool: fromUnits(poolUnits), distributed: 0, remainderToGlobal: fromUnits(poolUnits), rewards: [] };
  }

  // BigInt: pool * stake can exceed 2^53 for large stakes.
  const rewards: TeamReward[] = [];
  let distributed = 0;
  for (const w of winners) {
    const units = Number((BigInt(poolUnits) * BigInt(w.units)) / BigInt(winnersTotal));
    if (units <= 0) continue;
    distributed += units;
    rewards.push({ goalId: w.goalId, recipient: w.wallet, amount: fromUnits(units) });
  }
  return {
    teamPool: fromUnits(poolUnits),
    distributed: fromUnits(distributed),
    remainderToGlobal: fromUnits(poolUnits - distributed),
    rewards,
  };
}
