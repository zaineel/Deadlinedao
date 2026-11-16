import { claimPayout, finalizePayout, releasePayout } from '@/lib/supabase';
import { markPayoutUnconfirmed } from '@/lib/supabase/payouts';
import { sendPayoutFromEscrow } from './escrow';
import type { Goal } from '@/types';

export type StakeReturnResult =
  | { status: 'sent'; signature: string; amount: number }
  | { status: 'already_paid'; amount: number }
  /** Submission may have happened; the claim is KEPT. Resolve via /api/admin/payouts/reconcile. */
  | { status: 'unconfirmed'; amount: number; signature: string | null }
  | { status: 'failed'; amount: number; error: string };

/**
 * Phase 1 payout: return a completed goal's original stake from escrow.
 * Reserves the payout row BEFORE sending (unique per goal + type), so calling
 * this twice for the same goal can never pay twice. A definitive failure
 * releases the claim; an ambiguous one (tx may have landed) keeps it.
 */
export async function returnStake(goal: Goal): Promise<StakeReturnResult> {
  const amount = goal.stake_amount;
  const claim = await claimPayout(goal.id, goal.wallet_address, amount, 'original_stake');

  if (claim.error) return { status: 'failed', amount, error: 'Could not reserve payout; nothing was sent' };
  if (!claim.claimed) return { status: 'already_paid', amount };

  const { signature, error, ambiguous } = await sendPayoutFromEscrow(goal.wallet_address, amount);

  if (ambiguous) {
    if (signature) await markPayoutUnconfirmed(claim.payoutId!, signature);
    return { status: 'unconfirmed', amount, signature };
  }
  if (!signature || error) {
    await releasePayout(claim.payoutId!);
    return { status: 'failed', amount, error: error?.message || 'Transfer failed' };
  }

  await finalizePayout(claim.payoutId!, signature);
  return { status: 'sent', signature, amount };
}
