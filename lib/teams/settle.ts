import { computeTeamRewards, type TeamReward } from './rewards';
import { evaluateSettlement, type MemberGoalRow } from './settlement';

export interface SettleDeps {
  claim(goalId: string, wallet: string, amount: number): Promise<{ claimed: boolean; payoutId: string | null; error: Error | null }>;
  send(wallet: string, amount: number): Promise<{ signature: string | null; error: Error | null }>;
  finalize(payoutId: string, signature: string): Promise<unknown>;
  release(payoutId: string): Promise<unknown>;
}

export type RewardOutcome = TeamReward & {
  status: 'success' | 'already_distributed' | 'failed';
  signature?: string;
};

export type SettleResult =
  | { ok: false; reason: 'deadline_not_reached' | 'non_final_goals'; blockingGoalIds: string[] }
  | {
      ok: true;
      dryRun: boolean;
      teamPool: number;
      distributed: number;
      remainderToGlobal: number;
      planned: TeamReward[];
      outcomes: RewardOutcome[];
      /** True when every reward is paid (now or earlier), so the team goal may be marked settled. */
      complete: boolean;
    };

/**
 * Settle a team goal. Safe to re-run: each reward is claimed per member goal
 * (payout type team_reward, unique per goal) BEFORE any SOL is sent, so an
 * already-paid or in-flight reward is skipped and a failed send releases its
 * claim so a later run can retry it.
 */
export async function settleTeamGoal(
  teamGoal: { deadline: string },
  memberGoals: MemberGoalRow[],
  deps: SettleDeps,
  options: { dryRun?: boolean; now?: number } = {}
): Promise<SettleResult> {
  const readiness = evaluateSettlement(teamGoal, memberGoals, options.now);
  if (!readiness.ready) {
    return { ok: false, reason: readiness.reason, blockingGoalIds: readiness.blockingGoalIds };
  }
  const plan = computeTeamRewards(readiness.completed, readiness.failed);
  const base = {
    ok: true as const,
    dryRun: !!options.dryRun,
    teamPool: plan.teamPool,
    distributed: plan.distributed,
    remainderToGlobal: plan.remainderToGlobal,
    planned: plan.rewards,
  };
  if (options.dryRun) return { ...base, outcomes: [], complete: false };

  const outcomes: RewardOutcome[] = [];
  for (const r of plan.rewards) {
    const claim = await deps.claim(r.goalId, r.recipient, r.amount);
    if (claim.error) {
      outcomes.push({ ...r, status: 'failed' });
      continue;
    }
    if (!claim.claimed || !claim.payoutId) {
      outcomes.push({ ...r, status: 'already_distributed' });
      continue;
    }
    const sent = await deps.send(r.recipient, r.amount);
    if (!sent.signature || sent.error) {
      await deps.release(claim.payoutId);
      outcomes.push({ ...r, status: 'failed' });
      continue;
    }
    await deps.finalize(claim.payoutId, sent.signature);
    outcomes.push({ ...r, status: 'success', signature: sent.signature });
  }
  return { ...base, outcomes, complete: outcomes.every((o) => o.status !== 'failed') };
}
