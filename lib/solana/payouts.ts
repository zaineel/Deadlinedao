import type { Goal } from '@/types';

/**
 * Payout and redistribution logic for DeadlineDAO
 * Winners get their stake back + proportional share of losers' stakes
 */

export interface PayoutResult {
  recipient: string;
  amount: number;
  type: 'original_stake' | 'completion_reward';
  signature?: string;
  error?: string;
}

/**
 * Compute each completed goal's Phase 2 reward (pro rata share of failed stakes).
 * Pure math, one entry per goal, so callers can claim/send/record per goal.
 */
export function computeRewardPayouts(
  completedGoals: Goal[],
  failedGoals: Goal[]
): Array<{ goalId: string; recipient: string; amount: number }> {
  const totalWinnersStake = completedGoals.reduce((sum, g) => sum + g.stake_amount, 0);
  const totalLosersStake = failedGoals.reduce((sum, g) => sum + g.stake_amount, 0);
  if (totalWinnersStake <= 0 || totalLosersStake <= 0) return [];

  return completedGoals
    .map(g => ({
      goalId: g.id,
      recipient: g.wallet_address,
      // 4 decimals matches the payouts.amount column
      amount: Math.floor((g.stake_amount / totalWinnersStake) * totalLosersStake * 1e4) / 1e4,
    }))
    .filter(p => p.amount > 0);
}

/**
 * Calculate potential earnings for a goal
 * Shows users how much they could earn if they complete their goal
 */
export function calculatePotentialEarnings(
  userStake: number,
  totalActiveStakeInPeriod: number,
  estimatedCompletionRate: number = 0.5 // Default: assume 50% completion rate
): {
  minPayout: number;
  maxPayout: number;
  expectedPayout: number;
} {
  // Min: everyone completes, you just get your stake back
  const minPayout = userStake;

  // Max: only you complete, you get everything
  const maxPayout = totalActiveStakeInPeriod;

  // Expected: based on estimated completion rate
  const estimatedLosers = (1 - estimatedCompletionRate) * totalActiveStakeInPeriod;
  const estimatedWinners = estimatedCompletionRate * totalActiveStakeInPeriod;

  const yourProportion = estimatedWinners > 0 ? userStake / estimatedWinners : 0;
  const yourReward = yourProportion * estimatedLosers;
  const expectedPayout = userStake + yourReward;

  return {
    minPayout,
    maxPayout,
    expectedPayout,
  };
}

/**
 * Get payout breakdown for display
 */
export function formatPayoutBreakdown(
  originalStake: number,
  reward: number
): {
  originalStake: string;
  reward: string;
  total: string;
  rewardPercentage: string;
} {
  const total = originalStake + reward;
  const rewardPercentage = originalStake > 0 ? ((reward / originalStake) * 100).toFixed(2) : '0.00';

  return {
    originalStake: originalStake.toFixed(4),
    reward: reward.toFixed(4),
    total: total.toFixed(4),
    rewardPercentage,
  };
}
