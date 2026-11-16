/**
 * Pure sponsor-match logic. No I/O. All money is integer lamports.
 *
 * The database function `org_reserve_match` (supabase-migrations/005_orgs.sql)
 * re-enforces the same invariants atomically; this module decides WHAT to ask
 * for and models the reservation so the rules can be tested exhaustively.
 */

export const LAMPORTS_PER_SOL = 1_000_000_000;
/** payouts.amount is DECIMAL(10,4): matches are whole multiples of 0.0001 SOL. */
export const MATCH_GRANULARITY_LAMPORTS = 100_000;
export const MAX_MATCH_RATE_BPS = 10_000;

/** Exact SOL (<= 4 decimals, as stored) to lamports without float drift. */
export function solToLamportsExact(sol: number | string): number {
  return Math.round(Number(sol) * 1e4) * MATCH_GRANULARITY_LAMPORTS;
}

export function lamportsToSolNumber(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

const floorToGranularity = (n: number) =>
  Math.floor(n / MATCH_GRANULARITY_LAMPORTS) * MATCH_GRANULARITY_LAMPORTS;

export interface PoolState {
  remainingLamports: number;
  matchRateBps: number;
  perMemberCapLamports: number;
  windowStartMs: number;
  windowEndMs: number;
}

export interface MemberState {
  joinedAtMs: number;
  /** matches already reserved or paid to this member in this org */
  matchedLamports: number;
}

export interface GoalForMatch {
  status: string;
  createdAtMs: number;
  stakeLamports: number;
}

export type MatchRefusal =
  | 'not_member'
  | 'goal_not_completed'
  | 'joined_after_goal'
  | 'outside_window'
  | 'pool_exhausted'
  | 'cap_reached'
  | 'zero_match';

export type MatchDecision =
  | { ok: true; amountLamports: number }
  | { ok: false; reason: MatchRefusal };

/**
 * Decide the match for one completed goal.
 * amount = min(stake * rate, cap - already matched, pool remaining), floored
 * to payout granularity. Window edges are inclusive.
 */
export function decideMatch(input: {
  goal: GoalForMatch;
  member: MemberState | null;
  pool: PoolState;
}): MatchDecision {
  const { goal, member, pool } = input;
  if (!member) return { ok: false, reason: 'not_member' };
  if (goal.status !== 'completed') return { ok: false, reason: 'goal_not_completed' };
  if (member.joinedAtMs > goal.createdAtMs) return { ok: false, reason: 'joined_after_goal' };
  if (goal.createdAtMs < pool.windowStartMs || goal.createdAtMs > pool.windowEndMs) {
    return { ok: false, reason: 'outside_window' };
  }

  const capLeft = pool.perMemberCapLamports - member.matchedLamports;
  if (capLeft < MATCH_GRANULARITY_LAMPORTS) return { ok: false, reason: 'cap_reached' };
  if (pool.remainingLamports < MATCH_GRANULARITY_LAMPORTS) return { ok: false, reason: 'pool_exhausted' };

  // divide first (units of 0.0001 SOL) so the product stays inside 2^53
  const units = Math.floor(goal.stakeLamports / MATCH_GRANULARITY_LAMPORTS);
  const byRate = Math.floor((units * pool.matchRateBps) / 10_000) * MATCH_GRANULARITY_LAMPORTS;

  const amount = Math.min(byRate, floorToGranularity(capLeft), floorToGranularity(pool.remainingLamports));
  if (amount <= 0) return { ok: false, reason: 'zero_match' };
  return { ok: true, amountLamports: amount };
}

/**
 * In-memory model of the atomic reservation done by `org_reserve_match`:
 * `UPDATE ... SET remaining = remaining - $amount WHERE remaining >= $amount`
 * plus the per-member cap guard. Returns the new state, or null if refused.
 * Check-and-decrement is one step, which is what makes concurrent requests safe.
 */
export function applyReservation(
  pool: PoolState,
  member: MemberState,
  amountLamports: number
): { pool: PoolState; member: MemberState } | null {
  if (!Number.isInteger(amountLamports) || amountLamports <= 0) return null;
  if (pool.remainingLamports < amountLamports) return null;
  if (member.matchedLamports + amountLamports > pool.perMemberCapLamports) return null;
  return {
    pool: { ...pool, remainingLamports: pool.remainingLamports - amountLamports },
    member: { ...member, matchedLamports: member.matchedLamports + amountLamports },
  };
}

/** Undo a reservation (transfer definitively failed). */
export function applyRelease(
  pool: PoolState,
  member: MemberState,
  amountLamports: number
): { pool: PoolState; member: MemberState } {
  return {
    pool: { ...pool, remainingLamports: pool.remainingLamports + amountLamports },
    member: { ...member, matchedLamports: Math.max(0, member.matchedLamports - amountLamports) },
  };
}

export interface SweepGoal extends GoalForMatch {
  id: string;
  wallet: string;
}

export interface PlannedMatch {
  goalId: string;
  wallet: string;
  amountLamports: number;
}

/**
 * Plan matches for a batch of completed goals in creation order, threading the
 * pool and per-member state through so the plan itself never overspends.
 */
export function planMatches(input: {
  goals: SweepGoal[];
  members: Map<string, MemberState>;
  pool: PoolState;
}): { planned: PlannedMatch[]; skipped: Array<{ goalId: string; reason: MatchRefusal }> } {
  const planned: PlannedMatch[] = [];
  const skipped: Array<{ goalId: string; reason: MatchRefusal }> = [];
  let pool = input.pool;
  const members = new Map(input.members);

  const ordered = [...input.goals].sort((a, b) => a.createdAtMs - b.createdAtMs);
  for (const goal of ordered) {
    const member = members.get(goal.wallet) ?? null;
    const decision = decideMatch({ goal, member, pool });
    if (!decision.ok) {
      skipped.push({ goalId: goal.id, reason: decision.reason });
      continue;
    }
    const applied = applyReservation(pool, member!, decision.amountLamports);
    if (!applied) {
      skipped.push({ goalId: goal.id, reason: 'pool_exhausted' });
      continue;
    }
    pool = applied.pool;
    members.set(goal.wallet, applied.member);
    planned.push({ goalId: goal.id, wallet: goal.wallet, amountLamports: decision.amountLamports });
  }
  return { planned, skipped };
}

/**
 * Was an escrow send DEFINITELY not a transfer? sendPayoutFromEscrow reports
 * `ambiguous: true` whenever the signed transaction may have reached the
 * network (and then also returns the signature). Anything ambiguous, or any
 * result that does not carry a plain error, stays reserved because the
 * transfer may still land. Mirrors lib/solana/payout-classify.ts.
 */
export function isDefiniteSendFailure(result: { signature: string | null; error: Error | null; ambiguous: boolean }): boolean {
  return !result.ambiguous && !result.signature && !!result.error;
}
