import { getGoalById, transitionGoalStatus } from '@/lib/supabase/goals';
import { getProofsByGoal } from '@/lib/supabase/proofs';
import {
  getDisputeByGoal,
  getDisputeBySignature,
  isStakeSignature,
  createDispute,
} from '@/lib/supabase/disputes';
import { verifyStakeTransaction } from '@/lib/solana/escrow';
import { isDemoMode } from '@/lib/config/demo';
import { checkCanOpenDispute, computeBond, type OpenRefusal } from './logic';

export type OpenDisputeResult =
  | { status: 'opened'; disputeId: string; bondAmount: number }
  | { status: 'refused'; reason: OpenRefusal }
  | { status: 'goal_not_found' }
  | { status: 'bond_invalid' }
  | { status: 'error' };

/**
 * Open a dispute for the session wallet. Order matters:
 * 1. cheap DB checks (owner, status, window, one-per-goal, signature reuse),
 * 2. verify the bond transfer on-chain (user -> escrow, >= 5% of the stake),
 * 3. atomically move the goal rejected_appealable -> disputed,
 * 4. insert the dispute (unique goal_id and bond signature); if that fails the
 *    goal move is reverted.
 */
export async function openDispute(input: {
  sessionWallet: string;
  goalId: string;
  reason: string;
  extraImageUrl?: string | null;
  bondSignature: string;
  now?: Date;
}): Promise<OpenDisputeResult> {
  const now = input.now ?? new Date();
  const { data: goal } = await getGoalById(input.goalId);
  // Do not reveal other wallets' goals
  if (!goal || goal.wallet_address !== input.sessionWallet) return { status: 'goal_not_found' };

  const [existing, sigDispute, sigStake] = await Promise.all([
    getDisputeByGoal(goal.id),
    getDisputeBySignature(input.bondSignature),
    isStakeSignature(input.bondSignature),
  ]);
  if (existing.error || sigDispute.error || sigStake.error) return { status: 'error' };

  const check = checkCanOpenDispute({
    goal,
    sessionWallet: input.sessionWallet,
    existingDispute: Boolean(existing.data),
    signatureAlreadyUsed: Boolean(sigDispute.data) || sigStake.used,
    now,
  });
  if (!check.ok) return { status: 'refused', reason: check.reason };

  const bondAmount = computeBond(Number(goal.stake_amount));

  const isDemo = isDemoMode() && input.bondSignature.startsWith('demo_tx_');
  if (!isDemo) {
    const { valid } = await verifyStakeTransaction(input.bondSignature, bondAmount, input.sessionWallet);
    if (!valid) return { status: 'bond_invalid' };
  }

  const { data: moved, error: moveErr } = await transitionGoalStatus(goal.id, 'rejected_appealable', 'disputed');
  if (moveErr) return { status: 'error' };
  if (!moved) {
    // The window closed (cron) or another request won between the check and now.
    console.error(`[Disputes] bond ${input.bondSignature} verified but goal ${goal.id} left rejected_appealable; manual refund may be needed`);
    return { status: 'refused', reason: 'not_appealable' };
  }

  const { data: proofs } = await getProofsByGoal(goal.id);
  const created = await createDispute({
    goal_id: goal.id,
    proof_id: proofs?.[0]?.id ?? null,
    reason: input.reason,
    extra_image_url: input.extraImageUrl ?? null,
    bond_amount: bondAmount,
    bond_tx_signature: input.bondSignature,
  });

  if (!created.data) {
    await transitionGoalStatus(goal.id, 'disputed', 'rejected_appealable');
    if (created.duplicate) return { status: 'refused', reason: 'already_disputed' };
    return { status: 'error' };
  }

  return { status: 'opened', disputeId: created.data.id, bondAmount };
}
