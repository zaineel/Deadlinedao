import { getGoalById, transitionGoalStatus } from '@/lib/supabase/goals';
import { getDisputeById, finalizeDispute } from '@/lib/supabase/disputes';
import { returnStake } from '@/lib/solana/stake-return';
import { planResolution, type ResolveDecision, type DisputeStatus } from './logic';
import { refundBond } from './settle';
import { safeNotify } from './notify';

export type ResolveResult =
  | { status: 'not_found' }
  | { status: 'noop'; reason: 'already_resolved' | 'goal_not_disputed'; disputeStatus: DisputeStatus }
  | { status: 'payout_failed' }
  | { status: 'payout_unconfirmed' }
  | { status: 'error' }
  | {
      status: 'resolved';
      outcome: 'overturned' | 'upheld';
      stakeSignature?: string;
      bondSignature?: string;
    };

/**
 * Resolve an open dispute.
 *
 * - Resolving an already resolved dispute is a no-op (nothing moves).
 * - overturn: goal disputed -> completed (atomic), stake returned via
 *   returnStake, bond refunded (claim-before-send, 'bond_refund'). If a payout
 *   fails the dispute stays open so the admin can retry; every money step is
 *   idempotent, so a retry never pays twice.
 * - uphold: goal disputed -> failed, bond kept in escrow.
 */
export async function resolveDispute(disputeId: string, decision: ResolveDecision): Promise<ResolveResult> {
  const { data: dispute, error: dErr } = await getDisputeById(disputeId);
  if (dErr) return { status: 'error' };
  if (!dispute) return { status: 'not_found' };

  const { data: goal, error: gErr } = await getGoalById(dispute.goal_id);
  if (gErr || !goal) return { status: 'error' };

  const plan = planResolution({ disputeStatus: dispute.status, goalStatus: goal.status, decision });
  if (plan.kind === 'noop') {
    return { status: 'noop', reason: plan.reason, disputeStatus: dispute.status };
  }

  if (plan.transitionFrom) {
    const { data: moved, error } = await transitionGoalStatus(goal.id, plan.transitionFrom, plan.goalTo);
    if (error) return { status: 'error' };
    if (!moved) {
      // Someone else moved it between our read and this write.
      return { status: 'noop', reason: 'goal_not_disputed', disputeStatus: dispute.status };
    }
  }

  let stakeSignature: string | undefined;
  let bondSignature: string | undefined;

  if (plan.returnStake) {
    const stake = await returnStake({ ...goal, status: plan.goalTo });
    if (stake.status === 'failed') {
      console.error(`[Disputes] stake return failed for goal ${goal.id}; dispute ${dispute.id} stays open`);
      return { status: 'payout_failed' };
    }
    if (stake.status === 'unconfirmed') {
      // The transfer may have landed and the claim is kept. Stop here (no bond
      // refund, dispute stays open); reconcile the payout, then retry.
      console.error(`[Disputes] stake return unconfirmed for goal ${goal.id}; dispute ${dispute.id} stays open`);
      return { status: 'payout_unconfirmed' };
    }
    if (stake.status === 'sent') stakeSignature = stake.signature;
  }

  if (plan.refundBond) {
    const refund = await refundBond(goal.id, goal.wallet_address, Number(dispute.bond_amount));
    if (refund.status === 'failed') {
      console.error(`[Disputes] bond refund failed for goal ${goal.id}; dispute ${dispute.id} stays open`);
      return { status: 'payout_failed' };
    }
    if (refund.status === 'unconfirmed') {
      console.error(`[Disputes] bond refund unconfirmed for goal ${goal.id}; dispute ${dispute.id} stays open`);
      return { status: 'payout_unconfirmed' };
    }
    if (refund.status === 'sent') bondSignature = refund.signature;
  }

  const { finalized, error: finErr } = await finalizeDispute(dispute.id, plan.disputeTo);
  if (finErr) {
    console.error(`[Disputes] could not mark dispute ${dispute.id} ${plan.disputeTo}:`, finErr);
    return { status: 'error' };
  }

  // Only the caller that flipped the dispute notifies, and never fatally.
  if (finalized) {
    await safeNotify(
      {
        kind: 'appeal_resolved',
        goalId: goal.id,
        goalTitle: goal.title,
        outcome: plan.disputeTo === 'overturned' ? 'overturned' : 'upheld',
      },
      goal.wallet_address
    );
  }

  return { status: 'resolved', outcome: plan.disputeTo, stakeSignature, bondSignature };
}
