import { claimPayout, finalizePayout, releasePayout } from '@/lib/supabase';
import { sendPayoutFromEscrow } from './escrow';
import type { Goal } from '@/types';

export type StakeReturnResult =
  | { status: 'sent'; signature: string; amount: number }
  | { status: 'already_paid'; amount: number }
  | { status: 'failed'; amount: number; error: string };

/**
 * Phase 1 payout: return a completed goal's original stake from escrow.
 * Reserves the payout row BEFORE sending (unique per goal + type), so calling
 * this twice for the same goal can never pay twice.
 */
export async function returnStake(goal: Goal): Promise<StakeReturnResult> {
  const amount = goal.stake_amount;
  const claim = await claimPayout(goal.id, goal.wallet_address, amount, 'original_stake');

  if (claim.error) return { status: 'failed', amount, error: 'Could not reserve payout; nothing was sent' };
  if (!claim.claimed) return { status: 'already_paid', amount };

  const { signature, error } = await sendPayoutFromEscrow(goal.wallet_address, amount);
  if (!signature || error) {
    await releasePayout(claim.payoutId!);
    return { status: 'failed', amount, error: error?.message || 'Transfer failed' };
  }

  await finalizePayout(claim.payoutId!, signature);
  return { status: 'sent', signature, amount };
}
