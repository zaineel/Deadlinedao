import { sendPayoutFromEscrow, sendBatchPayouts } from './escrow';
import type { Goal } from '@/types';

/**
 * Payout and redistribution logic for DeadlineDAO
 * Winners get their stake back + proportional share of losers' stakes
 */

export interface PayoutRecipient {
  walletAddress: string;
  stakeAmount: number;
  goalId: string;
}

export interface PayoutResult {
  recipient: string;
  amount: number;
  type: 'original_stake' | 'completion_reward';
  signature?: string;
  error?: string;
}

export interface RedistributionResult {
  totalWinnersStake: number;
  totalLosersStake: number;
  payouts: PayoutResult[];
  errors: string[];
}

/**
 * Calculate proportional redistribution
 * Each winner gets: their original stake + (their stake / total winners stake) * total losers stake
 */
export function calculateRedistribution(
  winners: PayoutRecipient[],
  losers: PayoutRecipient[]
): Map<string, { originalStake: number; reward: number; total: number }> {
  const payoutMap = new Map<string, { originalStake: number; reward: number; total: number }>();

  // Calculate totals
  const totalWinnersStake = winners.reduce((sum, w) => sum + w.stakeAmount, 0);
  const totalLosersStake = losers.reduce((sum, l) => sum + l.stakeAmount, 0);

  // If no winners, no redistribution
  if (winners.length === 0 || totalWinnersStake === 0) {
    return payoutMap;
  }

  // Calculate each winner's payout
  for (const winner of winners) {
    const proportionOfWinners = winner.stakeAmount / totalWinnersStake;
    const reward = proportionOfWinners * totalLosersStake;
    const total = winner.stakeAmount + reward;

    payoutMap.set(winner.walletAddress, {
      originalStake: winner.stakeAmount,
      reward,
      total,
    });
  }

  return payoutMap;
}

/**
 * Execute redistribution for a set of completed and failed goals
 * This is the main function called when goals reach their deadline
 */
export async function executeRedistribution(
  completedGoals: Goal[],
  failedGoals: Goal[]
): Promise<RedistributionResult> {
  const winners: PayoutRecipient[] = completedGoals.map(goal => ({
    walletAddress: goal.wallet_address,
    stakeAmount: goal.stake_amount,
    goalId: goal.id,
  }));

  const losers: PayoutRecipient[] = failedGoals.map(goal => ({
    walletAddress: goal.wallet_address,
    stakeAmount: goal.stake_amount,
    goalId: goal.id,
  }));

  // Calculate redistribution
  const payoutMap = calculateRedistribution(winners, losers);

  const totalWinnersStake = winners.reduce((sum, w) => sum + w.stakeAmount, 0);
  const totalLosersStake = losers.reduce((sum, l) => sum + l.stakeAmount, 0);

  const payouts: PayoutResult[] = [];
  const errors: string[] = [];

  // If no winners, just return (stakes stay in escrow)
  if (payoutMap.size === 0) {
    return {
      totalWinnersStake,
      totalLosersStake,
      payouts: [],
      errors: ['No winners to distribute to'],
    };
  }

  // Prepare batch payouts
  const batchPayouts: Array<{ recipient: string; amount: number }> = [];

  for (const [walletAddress, payout] of payoutMap.entries()) {
    batchPayouts.push({
      recipient: walletAddress,
      amount: payout.total,
    });
  }

  // Execute batch payouts
  const { signatures, errors: batchErrors } = await sendBatchPayouts(batchPayouts);

  // Map results
  let signatureIndex = 0;
  for (const [walletAddress, payout] of payoutMap.entries()) {
    const hasError = batchErrors.find(e => e.recipient === walletAddress);

    if (hasError) {
      payouts.push({
        recipient: walletAddress,
        amount: payout.total,
        type: payout.reward > 0 ? 'completion_reward' : 'original_stake',
        error: hasError.error,
      });
      errors.push(`Failed to pay ${walletAddress}: ${hasError.error}`);
    } else {
      payouts.push({
        recipient: walletAddress,
        amount: payout.total,
        type: payout.reward > 0 ? 'completion_reward' : 'original_stake',
        signature: signatures[signatureIndex],
      });
      signatureIndex++;
    }
  }

  return {
    totalWinnersStake,
    totalLosersStake,
    payouts,
    errors,
  };
}

/**
 * Process payout for a single completed goal
 * Used when a goal is completed successfully
 */
export async function processCompletionPayout(
  goal: Goal,
  otherActiveGoalsSameDeadline: Goal[]
): Promise<PayoutResult> {
  try {
    // For single goal completion, check if there are simultaneous failures
    const failedGoals = otherActiveGoalsSameDeadline.filter(g => g.status === 'failed');

    if (failedGoals.length === 0) {
      // No losers, just return the original stake
      const { signature, error } = await sendPayoutFromEscrow(
        goal.wallet_address,
        goal.stake_amount
      );

      if (error) {
        return {
          recipient: goal.wallet_address,
          amount: goal.stake_amount,
          type: 'original_stake',
          error: error.message,
        };
      }

      return {
        recipient: goal.wallet_address,
        amount: goal.stake_amount,
        type: 'original_stake',
        signature: signature || undefined,
      };
    }

    // Calculate redistribution with other goals
    const result = await executeRedistribution([goal], failedGoals);

    if (result.payouts.length > 0) {
      return result.payouts[0];
    }

    return {
      recipient: goal.wallet_address,
      amount: 0,
      type: 'original_stake',
      error: 'Redistribution calculation failed',
    };
  } catch (error) {
    console.error('Error processing completion payout:', error);
    return {
      recipient: goal.wallet_address,
      amount: 0,
      type: 'original_stake',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
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

/**
 * Simulate redistribution (for testing/preview)
 */
export function simulateRedistribution(
  winners: Array<{ wallet: string; stake: number }>,
  losers: Array<{ wallet: string; stake: number }>
): Array<{ wallet: string; originalStake: number; reward: number; total: number }> {
  const winnersData: PayoutRecipient[] = winners.map(w => ({
    walletAddress: w.wallet,
    stakeAmount: w.stake,
    goalId: 'simulated',
  }));

  const losersData: PayoutRecipient[] = losers.map(l => ({
    walletAddress: l.wallet,
    stakeAmount: l.stake,
    goalId: 'simulated',
  }));

  const payoutMap = calculateRedistribution(winnersData, losersData);

  return Array.from(payoutMap.entries()).map(([wallet, payout]) => ({
    wallet,
    originalStake: payout.originalStake,
    reward: payout.reward,
    total: payout.total,
  }));
}
