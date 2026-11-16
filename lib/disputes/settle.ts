import { claimPayout, finalizePayout, releasePayout } from '@/lib/supabase/payouts';
import { sendPayoutFromEscrow } from '@/lib/solana/escrow';

export type BondRefundResult =
  | { status: 'sent'; signature: string; amount: number }
  | { status: 'already_paid'; amount: number }
  | { status: 'failed'; amount: number };

/**
 * Refund a winning appellant's bond. Claim-before-send, unique per
 * (goal, 'bond_refund'): calling this twice can never pay twice.
 */
export async function refundBond(goalId: string, wallet: string, amount: number): Promise<BondRefundResult> {
  const claim = await claimPayout(goalId, wallet, amount, 'bond_refund');
  if (claim.error) return { status: 'failed', amount };
  if (!claim.claimed) return { status: 'already_paid', amount };

  const { signature, error } = await sendPayoutFromEscrow(wallet, amount);
  if (!signature || error) {
    await releasePayout(claim.payoutId!);
    return { status: 'failed', amount };
  }
  await finalizePayout(claim.payoutId!, signature);
  return { status: 'sent', signature, amount };
}
