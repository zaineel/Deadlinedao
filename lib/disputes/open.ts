import { getGoalById, transitionGoalStatus } from '@/lib/supabase/goals';
import { getProofsByGoal } from '@/lib/supabase/proofs';
import { getDisputeByGoal, createDispute } from '@/lib/supabase/disputes';
import { isSignatureUsed } from '@/lib/solana/signature-registry';
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
 * 2. atomically claim the goal: rejected_appealable -> disputed (this also
 *    shuts out the finalize cron, so a paid bond can never lack a dispute),
 * 3. verify the bond transfer on-chain (user -> escrow, >= 5% of the stake);
 *    if invalid the goal is handed back,
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

  // One on-chain transfer is credited once across stakes, org fundings and bonds.
  // The registry throws on a DB error: fail closed.
  const existing = await getDisputeByGoal(goal.id);
  if (existing.error) return { status: 'error' };
  let signatureUsed: boolean;
  try {
    signatureUsed = await isSignatureUsed(input.bondSignature);
  } catch {
    return { status: 'error' };
  }

  const check = checkCanOpenDispute({
    goal,
    sessionWallet: input.sessionWallet,
    existingDispute: Boolean(existing.data),
    signatureAlreadyUsed: signatureUsed,
    now,
  });
  if (!check.ok) return { status: 'refused', reason: check.reason };

  const bondAmount = computeBond(Number(goal.stake_amount));

  // Claim the goal BEFORE looking at the chain. The atomic transition is the
  // gate: once we hold 'disputed' the cron can no longer fail the goal, so a
  // verified bond can never be left without a dispute (no paid-but-unrecorded
  // window). If verification then fails, the goal is handed back.
  const { data: moved, error: moveErr } = await transitionGoalStatus(goal.id, 'rejected_appealable', 'disputed');
  if (moveErr) return { status: 'error' };
  if (!moved) {
    // The window closed (cron) or another request won between the check and now.
    // Nothing was verified or paid yet, so nothing needs refunding.
    return { status: 'refused', reason: 'not_appealable' };
  }

  const isDemo = isDemoMode() && input.bondSignature.startsWith('demo_tx_');
  if (!isDemo) {
    let valid = false;
    try {
      ({ valid } = await verifyStakeTransaction(input.bondSignature, bondAmount, input.sessionWallet));
    } catch (e) {
      console.error(`[Disputes] bond verification threw for goal ${goal.id}:`, e);
    }
    if (!valid) {
      await transitionGoalStatus(goal.id, 'disputed', 'rejected_appealable');
      return { status: 'bond_invalid' };
    }
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
