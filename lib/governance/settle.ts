import { sendPayoutFromEscrow } from '@/lib/solana/escrow';
import {
  claimReward,
  finalizeReward,
  getReward,
  markRewardUnconfirmed,
  releaseReward,
} from '@/lib/supabase/governance';
import { lamportsToSol } from './logic';

export type RewardResult =
  | { status: 'sent'; signature: string }
  | { status: 'already_paid' }
  /** A claim exists but is not confirmed paid (in flight, or an ambiguous send). Never re-sent. */
  | { status: 'in_flight' }
  /** Submission may have landed: the claim is KEPT and marked unconfirmed. */
  | { status: 'unconfirmed'; signature: string | null }
  | { status: 'failed' };

/**
 * Pay one majority voter their share of an upheld bond. Same discipline as
 * lib/disputes/settle.ts: claim-before-send (unique per (dispute, voter)),
 * release the claim ONLY on a definite failure, keep it on an ambiguous one.
 */
export async function payVoterReward(disputeId: string, wallet: string, amountLamports: number): Promise<RewardResult> {
  if (!Number.isInteger(amountLamports) || amountLamports <= 0) return { status: 'failed' };

  const claim = await claimReward(disputeId, wallet, amountLamports);
  if (claim.error) return { status: 'failed' };
  if (!claim.claimed) {
    const existing = await getReward(disputeId, wallet);
    if (existing.error || !existing.data) return { status: 'in_flight' };
    return existing.data.status === 'paid' ? { status: 'already_paid' } : { status: 'in_flight' };
  }

  const { signature, error, ambiguous } = await sendPayoutFromEscrow(wallet, lamportsToSol(amountLamports));
  if (ambiguous) {
    // Never release on an ambiguous failure: the transfer may have landed.
    await markRewardUnconfirmed(claim.rewardId!, signature);
    return { status: 'unconfirmed', signature };
  }
  if (!signature || error) {
    await releaseReward(claim.rewardId!);
    return { status: 'failed' };
  }
  await finalizeReward(claim.rewardId!, signature);
  return { status: 'sent', signature };
}
