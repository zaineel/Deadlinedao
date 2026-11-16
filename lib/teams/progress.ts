import { hasStaked } from './settlement';

export type MemberProgressStatus = 'not_staked' | 'awaiting_stake' | 'active' | 'completed' | 'failed' | 'in_review';

/** Collapses a member's goal row into a status that is safe to show teammates (no proofs or text). */
export function memberProgressStatus(goal: { status: string; stake_tx_signature: string } | undefined): MemberProgressStatus {
  if (!goal) return 'not_staked';
  if (!hasStaked(goal)) return 'awaiting_stake';
  if (goal.status === 'active') return 'active';
  if (goal.status === 'completed') return 'completed';
  if (goal.status === 'failed') return 'failed';
  return 'in_review';
}

export interface TeamGoalProgress {
  members: Array<{ wallet: string; status: MemberProgressStatus }>;
  completed: number;
  staked: number;
  total: number;
}

export function buildTeamGoalProgress(
  memberWallets: string[],
  goals: Array<{ wallet_address: string; status: string; stake_tx_signature: string }>
): TeamGoalProgress {
  const byWallet = new Map(goals.map((g) => [g.wallet_address, g]));
  const members = memberWallets.map((wallet) => ({ wallet, status: memberProgressStatus(byWallet.get(wallet)) }));
  return {
    members,
    completed: members.filter((m) => m.status === 'completed').length,
    staked: members.filter((m) => m.status !== 'not_staked' && m.status !== 'awaiting_stake').length,
    total: members.length,
  };
}
