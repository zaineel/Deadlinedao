import { getGoalById } from '@/lib/supabase/goals';
import {
  createGovernanceWithPanel,
  getCompletedGoalCounts,
  getConflictedWallets,
  getWalletsWithPendingDispute,
} from '@/lib/supabase/governance';
import type { Dispute } from '@/lib/supabase/disputes';
import { computeVotingEnd, drawPanel, planPanel, selectEligible, type RandomInt } from './logic';
import { getGovernanceParams, type GovernanceParams } from './params';

export type DrawResult =
  | { status: 'panel'; panel: string[]; eligible: number }
  | { status: 'admin'; reason: string }
  | { status: 'exists' }
  | { status: 'error' };

/**
 * Draw the panel for an open dispute (once). Eligibility data is fetched
 * fail-closed: any DB error aborts the draw so nobody is drawn from partial
 * conflict-of-interest data. Too few eligible voters records why and leaves
 * the dispute in the existing admin flow.
 */
export async function drawPanelForDispute(
  dispute: Pick<Dispute, 'id' | 'goal_id' | 'status'>,
  opts: { now?: Date; params?: GovernanceParams; rng?: RandomInt } = {}
): Promise<DrawResult> {
  if (dispute.status !== 'open') return { status: 'error' };
  const now = opts.now ?? new Date();
  const params = opts.params ?? getGovernanceParams();

  const { data: goal, error: gErr } = await getGoalById(dispute.goal_id);
  if (gErr || !goal) return { status: 'error' };

  const [counts, pending, conflicts] = await Promise.all([
    getCompletedGoalCounts(),
    getWalletsWithPendingDispute(),
    getConflictedWallets(goal.wallet_address),
  ]);
  if (!counts.data || !pending.data || !conflicts.data) return { status: 'error' };

  const eligible = selectEligible({
    completedCounts: counts.data,
    ownerWallet: goal.wallet_address,
    walletsWithPendingDispute: pending.data,
    conflictedWallets: conflicts.data,
    minCompletedGoals: params.minCompletedGoals,
  });

  const plan = planPanel(eligible.length, params);
  if (plan.mode === 'admin') {
    const res = await createGovernanceWithPanel({
      dispute_id: dispute.id,
      mode: 'admin',
      fallback_reason: plan.fallbackReason,
      panel_size: 0,
      quorum: params.quorum,
      eligible_count: eligible.length,
      drawn_at: now,
      voting_ends_at: null,
      panel: [],
    });
    if (res.duplicate) return { status: 'exists' };
    if (res.error) return { status: 'error' };
    return { status: 'admin', reason: plan.fallbackReason };
  }

  const panel = drawPanel(eligible, plan.panelSize, opts.rng);
  const res = await createGovernanceWithPanel({
    dispute_id: dispute.id,
    mode: 'panel',
    fallback_reason: null,
    panel_size: panel.length,
    quorum: params.quorum,
    eligible_count: eligible.length,
    drawn_at: now,
    voting_ends_at: computeVotingEnd(now, params.votingWindowHours),
    panel,
  });
  if (res.duplicate) return { status: 'exists' };
  if (res.error) return { status: 'error' };
  return { status: 'panel', panel, eligible: eligible.length };
}
