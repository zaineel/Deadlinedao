import type { GoalStatus } from '@/types';

/**
 * Pure rules for validation disputes (appeals). No I/O: everything here takes
 * plain values so it can be unit tested exhaustively.
 */

export const APPEAL_WINDOW_HOURS = 48;
export const APPEAL_WINDOW_MS = APPEAL_WINDOW_HOURS * 60 * 60 * 1000;
/** Bond = 5% of the stake, in basis points. */
export const BOND_BPS = 500;
const LAMPORTS_PER_SOL = 1_000_000_000;

export type DisputeStatus = 'open' | 'overturned' | 'upheld';
export type ResolveDecision = 'overturn' | 'uphold';

/** Goal statuses that are still undecided: their stake must not enter the reward pool. */
export const NON_FINAL_APPEAL_STATUSES = ['rejected_appealable', 'disputed'] as const;

export function isUnsettledStatus(status: string): boolean {
  return (NON_FINAL_APPEAL_STATUSES as readonly string[]).includes(status);
}

/** Bond in SOL for a stake: 5%, rounded UP to the nearest lamport. */
export function computeBond(stakeSol: number): number {
  if (!Number.isFinite(stakeSol) || stakeSol <= 0) throw new RangeError('Invalid stake');
  const stakeLamports = Math.round(stakeSol * LAMPORTS_PER_SOL);
  const bondLamports = Math.ceil((stakeLamports * BOND_BPS) / 10_000);
  return bondLamports / LAMPORTS_PER_SOL;
}

export function computeAppealDeadline(now: Date | number): Date {
  const t = now instanceof Date ? now.getTime() : now;
  return new Date(t + APPEAL_WINDOW_MS);
}

/** True while the appeal window is open. A missing/invalid deadline means closed. */
export function isAppealWindowOpen(appealDeadline: string | null | undefined, now: Date | number): boolean {
  if (!appealDeadline) return false;
  const end = new Date(appealDeadline).getTime();
  if (Number.isNaN(end)) return false;
  const t = now instanceof Date ? now.getTime() : now;
  return t < end;
}

/** True when an unappealed rejection should now become final. */
export function isAppealWindowClosed(appealDeadline: string | null | undefined, now: Date | number): boolean {
  if (!appealDeadline) return false;
  const end = new Date(appealDeadline).getTime();
  if (Number.isNaN(end)) return false;
  const t = now instanceof Date ? now.getTime() : now;
  return t >= end;
}

/* ---------- opening a dispute ---------- */

export type OpenRefusal =
  | 'not_owner'
  | 'not_appealable'
  | 'window_closed'
  | 'already_disputed'
  | 'signature_reused';

export type OpenCheck = { ok: true } | { ok: false; reason: OpenRefusal };

export function checkCanOpenDispute(input: {
  goal: { wallet_address: string; status: GoalStatus | string; appeal_deadline?: string | null };
  sessionWallet: string;
  existingDispute: boolean;
  signatureAlreadyUsed: boolean;
  now: Date | number;
}): OpenCheck {
  const { goal, sessionWallet, existingDispute, signatureAlreadyUsed, now } = input;
  if (goal.wallet_address !== sessionWallet) return { ok: false, reason: 'not_owner' };
  if (existingDispute) return { ok: false, reason: 'already_disputed' };
  if (goal.status !== 'rejected_appealable') return { ok: false, reason: 'not_appealable' };
  if (!isAppealWindowOpen(goal.appeal_deadline, now)) return { ok: false, reason: 'window_closed' };
  if (signatureAlreadyUsed) return { ok: false, reason: 'signature_reused' };
  return { ok: true };
}

/* ---------- resolving a dispute ---------- */

export type ResolutionPlan =
  | { kind: 'noop'; reason: 'already_resolved' | 'goal_not_disputed' }
  | {
      kind: 'apply';
      decision: ResolveDecision;
      /** Goal status after resolution. */
      goalTo: 'completed' | 'failed';
      /**
       * 'disputed' when the goal still has to be moved; null when a previous
       * partially-failed attempt already moved it (resume: only payouts remain).
       */
      transitionFrom: 'disputed' | null;
      disputeTo: 'overturned' | 'upheld';
      returnStake: boolean;
      refundBond: boolean;
    };

/**
 * Decide what resolving a dispute should do. Resolving an already resolved
 * dispute is a no-op. A dispute that is still open whose goal already holds the
 * target status is a resume (money steps are idempotent via claim-before-send).
 */
export function planResolution(input: {
  disputeStatus: DisputeStatus;
  goalStatus: GoalStatus | string;
  decision: ResolveDecision;
}): ResolutionPlan {
  const { disputeStatus, goalStatus, decision } = input;
  if (disputeStatus !== 'open') return { kind: 'noop', reason: 'already_resolved' };

  const goalTo = decision === 'overturn' ? 'completed' : 'failed';
  let transitionFrom: 'disputed' | null;
  if (goalStatus === 'disputed') transitionFrom = 'disputed';
  else if (goalStatus === goalTo) transitionFrom = null;
  else return { kind: 'noop', reason: 'goal_not_disputed' };

  return {
    kind: 'apply',
    decision,
    goalTo,
    transitionFrom,
    disputeTo: decision === 'overturn' ? 'overturned' : 'upheld',
    returnStake: decision === 'overturn',
    refundBond: decision === 'overturn',
  };
}

/* ---------- reward pool ---------- */

/**
 * Goals on a deadline day that are still waiting on an appeal. While any
 * exist, rewards for that day must not be distributed.
 */
export function unsettledGoals<T extends { status: string }>(goals: T[]): T[] {
  return goals.filter((g) => isUnsettledStatus(g.status));
}

/** Only `failed` goals feed the reward pool. */
export function poolGoals<T extends { status: string }>(goals: T[]): T[] {
  return goals.filter((g) => g.status === 'failed');
}
