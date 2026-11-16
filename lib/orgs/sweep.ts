import { supabase } from '@/lib/supabase/client';
import { claimPayout, finalizePayout, releasePayout } from '@/lib/supabase/payouts';
import { sendPayoutFromEscrow } from '@/lib/solana/escrow';
import {
  isDefiniteSendFailure,
  lamportsToSolNumber,
  planMatches,
  solToLamportsExact,
  type MemberState,
  type PlannedMatch,
  type PoolState,
  type SweepGoal,
} from './match';
import { markMatchPaid, releaseMatch, reserveMatch, type PoolRow } from './db';

export type MatchOutcome =
  | { status: 'paid'; goalId: string; signature: string; amountLamports: number }
  | { status: 'refused'; goalId: string }
  | { status: 'already_paid'; goalId: string }
  | { status: 'failed'; goalId: string }
  | { status: 'ambiguous'; goalId: string };

/** I/O the match executor needs; injectable so the ordering can be unit-tested. */
export interface MatchDeps {
  reserve: (orgId: string, wallet: string, goalId: string, lamports: number) => Promise<{ id: string | null; error: boolean }>;
  releaseReservation: (matchId: string) => Promise<void>;
  markPaid: (matchId: string, signature: string) => Promise<void>;
  claim: (goalId: string, wallet: string, sol: number) => Promise<{ claimed: boolean; payoutId: string | null; error: boolean }>;
  finalize: (payoutId: string, signature: string) => Promise<void>;
  releasePayoutClaim: (payoutId: string) => Promise<void>;
  send: (wallet: string, sol: number) => Promise<{ signature: string | null; error: Error | null }>;
}

/**
 * Pay one planned match. Order is the money-safety contract:
 *  1. reserve from the pool (atomic, unique per goal)
 *  2. claim the sponsor_match payout row (unique per goal + type)
 *  3. send
 *  4a. sent: finalize both records
 *  4b. DEFINITELY not sent: release payout claim and return the reservation
 *  4c. ambiguous: leave both reserved so nothing can be paid twice or returned early
 */
export async function executeMatch(deps: MatchDeps, orgId: string, plan: PlannedMatch): Promise<MatchOutcome> {
  const { goalId, wallet, amountLamports } = plan;
  const sol = lamportsToSolNumber(amountLamports);

  const reservation = await deps.reserve(orgId, wallet, goalId, amountLamports);
  if (reservation.error) return { status: 'failed', goalId };
  if (!reservation.id) return { status: 'refused', goalId };
  const matchId = reservation.id;

  const claim = await deps.claim(goalId, wallet, sol);
  if (claim.error || !claim.claimed || !claim.payoutId) {
    // nothing was sent; give the money back to the pool
    await deps.releaseReservation(matchId);
    return claim.error ? { status: 'failed', goalId } : { status: 'already_paid', goalId };
  }

  const { signature, error } = await deps.send(wallet, sol);
  if (signature) {
    await deps.finalize(claim.payoutId, signature);
    await deps.markPaid(matchId, signature);
    return { status: 'paid', goalId, signature, amountLamports };
  }

  if (isDefiniteSendFailure(error)) {
    await deps.releasePayoutClaim(claim.payoutId);
    await deps.releaseReservation(matchId);
    return { status: 'failed', goalId };
  }
  console.error(`[orgs] match for goal ${goalId} is in an ambiguous state; left reserved for manual review`);
  return { status: 'ambiguous', goalId };
}

export const defaultMatchDeps: MatchDeps = {
  reserve: async (orgId, wallet, goalId, lamports) => {
    const r = await reserveMatch(orgId, wallet, goalId, lamports);
    return { id: r.data, error: !!r.error };
  },
  releaseReservation: releaseMatch,
  markPaid: markMatchPaid,
  claim: async (goalId, wallet, sol) => {
    const c = await claimPayout(goalId, wallet, sol, 'sponsor_match');
    return { claimed: c.claimed, payoutId: c.payoutId, error: !!c.error };
  },
  finalize: async (payoutId, signature) => {
    await finalizePayout(payoutId, signature);
  },
  releasePayoutClaim: releasePayout,
  send: sendPayoutFromEscrow,
};

export interface SweepSummary {
  pools: number;
  considered: number;
  paid: number;
  refused: number;
  alreadyPaid: number;
  failed: number;
  ambiguous: number;
}

const MAX_GOALS_PER_POOL = 500;

function poolState(p: PoolRow): PoolState {
  return {
    remainingLamports: Number(p.remaining_lamports),
    matchRateBps: p.match_rate_bps,
    perMemberCapLamports: Number(p.per_member_cap_lamports),
    windowStartMs: Date.parse(p.window_start),
    windowEndMs: Date.parse(p.window_end),
  };
}

/**
 * Find completed goals of eligible org members (joined at or before the goal
 * was created, goal created inside the program window) that have no match yet,
 * and pay them. Idempotent: unique-per-goal reservation and payout rows mean a
 * re-run or an overlapping run can never pay a goal twice.
 */
export async function runOrgMatchSweep(
  options: { maxPayments?: number; deps?: MatchDeps } = {}
): Promise<SweepSummary> {
  const deps = options.deps ?? defaultMatchDeps;
  let budget = options.maxPayments ?? 25;
  const summary: SweepSummary = { pools: 0, considered: 0, paid: 0, refused: 0, alreadyPaid: 0, failed: 0, ambiguous: 0 };

  const { data: pools, error } = await supabase.from('org_pools').select('*').gt('remaining_lamports', 0);
  if (error) throw error;

  for (const pool of (pools ?? []) as PoolRow[]) {
    if (budget <= 0) break;
    summary.pools++;

    const { data: memberRows, error: mErr } = await supabase
      .from('org_members')
      .select('wallet, joined_at, matched_lamports')
      .eq('org_id', pool.org_id);
    if (mErr) throw mErr;
    const members = new Map<string, MemberState>();
    for (const m of memberRows ?? []) {
      members.set(m.wallet as string, {
        joinedAtMs: Date.parse(m.joined_at as string),
        matchedLamports: Number(m.matched_lamports),
      });
    }
    if (members.size === 0) continue;

    const { data: goalRows, error: gErr } = await supabase
      .from('goals')
      .select('id, wallet_address, status, created_at, stake_amount')
      .eq('status', 'completed')
      .in('wallet_address', [...members.keys()])
      .gte('created_at', pool.window_start)
      .lte('created_at', pool.window_end)
      .order('created_at', { ascending: true })
      .limit(MAX_GOALS_PER_POOL);
    if (gErr) throw gErr;
    const goals = goalRows ?? [];
    if (goals.length === 0) continue;

    const ids = goals.map((g) => g.id as string);
    const [matched, paid] = await Promise.all([
      supabase.from('org_matches').select('goal_id').in('goal_id', ids),
      supabase.from('payouts').select('goal_id').eq('payout_type', 'sponsor_match').in('goal_id', ids),
    ]);
    if (matched.error) throw matched.error;
    if (paid.error) throw paid.error;
    const done = new Set<string>([
      ...(matched.data ?? []).map((r) => r.goal_id as string),
      ...(paid.data ?? []).map((r) => r.goal_id as string),
    ]);

    const sweepGoals: SweepGoal[] = goals
      .filter((g) => !done.has(g.id as string))
      .map((g) => ({
        id: g.id as string,
        wallet: g.wallet_address as string,
        status: g.status as string,
        createdAtMs: Date.parse(g.created_at as string),
        stakeLamports: solToLamportsExact(g.stake_amount as number),
      }));
    summary.considered += sweepGoals.length;

    const { planned } = planMatches({ goals: sweepGoals, members, pool: poolState(pool) });
    for (const plan of planned) {
      if (budget <= 0) break;
      budget--;
      const outcome = await executeMatch(deps, pool.org_id, plan);
      if (outcome.status === 'paid') summary.paid++;
      else if (outcome.status === 'refused') summary.refused++;
      else if (outcome.status === 'already_paid') summary.alreadyPaid++;
      else if (outcome.status === 'failed') summary.failed++;
      else summary.ambiguous++;
    }
  }
  return summary;
}
