import { claimPayout, finalizePayout, releasePayout, markPayoutUnconfirmed } from '@/lib/supabase/payouts';
import { sendPayoutFromEscrow } from '@/lib/solana/escrow';

export type BondRefundResult =
  | { status: 'sent'; signature: string; amount: number }
  | { status: 'already_paid'; amount: number }
  /** Submission may have landed: the claim is KEPT; reconcile via /api/admin/payouts/reconcile. */
  | { status: 'unconfirmed'; amount: number; signature: string | null }
  | { status: 'failed'; amount: number };

/**
 * Refund a winning appellant's bond. Claim-before-send, unique per
 * (goal, 'bond_refund'): calling this twice can never pay twice.
 */
export async function refundBond(goalId: string, wallet: string, amount: number): Promise<BondRefundResult> {
  const claim = await claimPayout(goalId, wallet, amount, 'bond_refund');
  if (claim.error) return { status: 'failed', amount };
  if (!claim.claimed) return { status: 'already_paid', amount };

  const { signature, error, ambiguous } = await sendPayoutFromEscrow(wallet, amount);
  if (ambiguous) {
    // Never release on an ambiguous failure: the transfer may have landed.
    if (signature) await markPayoutUnconfirmed(claim.payoutId!, signature);
    return { status: 'unconfirmed', amount, signature };
  }
  if (!signature || error) {
    await releasePayout(claim.payoutId!);
    return { status: 'failed', amount };
  }
  await finalizePayout(claim.payoutId!, signature);
  return { status: 'sent', signature, amount };
}
