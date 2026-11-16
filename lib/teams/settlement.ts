import type { TeamMemberGoal } from './rewards';

/** Final statuses are the only ones that may feed a settlement. */
export const FINAL_STATUSES = ['completed', 'failed'] as const;

export interface MemberGoalRow {
  id: string;
  wallet_address: string;
  stake_amount: number;
  stake_tx_signature: string;
  status: string;
}

/** A goal whose stake was never confirmed holds no money and is not a participant. */
export function hasStaked(g: { stake_tx_signature: string }): boolean {
  return g.stake_tx_signature !== 'pending';
}

export type Readiness =
  | { ready: true; completed: TeamMemberGoal[]; failed: TeamMemberGoal[] }
  | { ready: false; reason: 'deadline_not_reached' | 'non_final_goals'; blockingGoalIds: string[] };

/**
 * Settlement is allowed only after the deadline and only when EVERY staked
 * member goal is final (completed/failed). Anything else (active, awaiting
 * validation, appeal/dispute states added by other phases) blocks it.
 */
export function evaluateSettlement(
  teamGoal: { deadline: string },
  goals: MemberGoalRow[],
  now = Date.now()
): Readiness {
  if (new Date(teamGoal.deadline).getTime() > now) {
    return { ready: false, reason: 'deadline_not_reached', blockingGoalIds: [] };
  }
  const staked = goals.filter(hasStaked);
  const blocking = staked.filter((g) => !(FINAL_STATUSES as readonly string[]).includes(g.status));
  if (blocking.length > 0) {
    return { ready: false, reason: 'non_final_goals', blockingGoalIds: blocking.map((g) => g.id) };
  }
  const map = (g: MemberGoalRow): TeamMemberGoal => ({
    goalId: g.id,
    wallet: g.wallet_address,
    stake: Number(g.stake_amount),
  });
  return {
    ready: true,
    completed: staked.filter((g) => g.status === 'completed').map(map),
    failed: staked.filter((g) => g.status === 'failed').map(map),
  };
}
