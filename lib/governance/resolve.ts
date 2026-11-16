import { resolveDispute, type ResolveResult } from '@/lib/disputes/resolve';
import { getDisputeById, listOpenDisputes, type Dispute } from '@/lib/supabase/disputes';
import {
  bumpVoterStats,
  claimStatsApplication,
  getGovernance,
  listGovernanceByIds,
  listGovernanceByState,
  listGovernanceNeedingRewards,
  listPanel,
  listVotes,
  markRewardsSettled,
  updateGovernanceState,
  writeAudit,
  type DisputeGovernance,
} from '@/lib/supabase/governance';
import {
  bondToLamports,
  computeRewardSplit,
  isResolutionDue,
  majorityVoters,
  statsDeltas,
  tallyVotes,
  type Vote,
} from './logic';
import { getGovernanceParams, type GovernanceParams } from './params';
import { drawPanelForDispute } from './draw';
import { payVoterReward } from './settle';

type ResolvedBy = 'panel' | 'admin' | 'admin_override';

const decisionOf = (status: Dispute['status']): Vote | null =>
  status === 'overturned' ? 'overturn' : status === 'upheld' ? 'uphold' : null;

/**
 * Mark governance resolved (once) and apply voter statistics (once).
 * `changed` is true only for the caller that flipped the state.
 */
async function finalizeGovernance(
  g: DisputeGovernance,
  decision: Vote,
  resolvedBy: ResolvedBy
): Promise<boolean> {
  const { changed } = await updateGovernanceState(g.dispute_id, ['voting', 'escalated', 'admin'], {
    state: 'resolved',
    decision,
    resolved_by: resolvedBy,
    resolved_at: new Date().toISOString(),
  });
  if (!changed) return false;

  if (g.mode === 'panel' && (await claimStatsApplication(g.dispute_id))) {
    const [panel, votes] = await Promise.all([listPanel(g.dispute_id), listVotes(g.dispute_id)]);
    if (panel.data && votes.data) {
      await bumpVoterStats(statsDeltas(panel.data, votes.data, decision));
    }
  }
  return true;
}

export type ProcessOutcome =
  | 'not_due'
  | 'resolved'
  | 'escalated'
  | 'closed_elsewhere'
  | 'payout_pending'
  | 'error';

/**
 * Decide one dispute that is in the voting state. Calls the existing
 * resolveDispute so stake return / bond refund / claim-before-send /
 * unconfirmed handling are reused unchanged. Safe to run concurrently and to
 * retry: votes are immutable once the dispute is due, and resolveDispute is
 * idempotent.
 */
export async function processVotingDispute(g: DisputeGovernance, now: Date): Promise<ProcessOutcome> {
  const { data: dispute, error: dErr } = await getDisputeById(g.dispute_id);
  if (dErr || !dispute) return 'error';

  const votesRes = await listVotes(g.dispute_id);
  if (!votesRes.data) return 'error';
  const votes = votesRes.data;

  if (dispute.status !== 'open') {
    // Resolved by someone else (the admin) in the meantime.
    const decided = decisionOf(dispute.status);
    if (decided) await finalizeGovernance(g, decided, 'admin');
    return 'closed_elsewhere';
  }

  if (!isResolutionDue({ votingEndsAt: g.voting_ends_at, panelSize: g.panel_size, castVotes: votes.length, now })) {
    return 'not_due';
  }

  const outcome = tallyVotes(votes, g.quorum);
  if (outcome.kind === 'escalate') {
    const { changed } = await updateGovernanceState(g.dispute_id, ['voting'], {
      state: 'escalated',
      escalated_reason: outcome.reason,
    });
    if (changed) {
      await writeAudit(g.dispute_id, 'escalated', 'system', { reason: outcome.reason, tally: outcome.tally });
    }
    return 'escalated';
  }

  const result: ResolveResult = await resolveDispute(g.dispute_id, outcome.decision);
  switch (result.status) {
    case 'resolved': {
      const flipped = await finalizeGovernance(g, outcome.decision, 'panel');
      if (flipped) {
        await writeAudit(g.dispute_id, 'panel_resolved', 'system', {
          decision: outcome.decision,
          tally: outcome.tally,
        });
      }
      return 'resolved';
    }
    case 'noop': {
      if (result.reason === 'goal_not_disputed') {
        const { changed } = await updateGovernanceState(g.dispute_id, ['voting'], {
          state: 'escalated',
          escalated_reason: 'goal_state_mismatch',
        });
        if (changed) await writeAudit(g.dispute_id, 'escalated', 'system', { reason: 'goal_state_mismatch' });
        return 'escalated';
      }
      // Already resolved. If it matches the panel decision (e.g. we crashed
      // after resolving but before recording) credit the panel, else the admin.
      const actual = decisionOf(result.disputeStatus);
      if (actual) await finalizeGovernance(g, actual, actual === outcome.decision ? 'panel' : 'admin');
      return 'closed_elsewhere';
    }
    case 'payout_failed':
    case 'payout_unconfirmed':
      // Dispute stays open; the next run retries (idempotent) or the admin reconciles.
      return 'payout_pending';
    default:
      return 'error';
  }
}

/** Escalated / admin-mode disputes the admin resolved through the old flow: close their governance record. */
async function reconcileClosed(g: DisputeGovernance): Promise<boolean> {
  const { data: dispute } = await getDisputeById(g.dispute_id);
  if (!dispute || dispute.status === 'open') return false;
  const decided = decisionOf(dispute.status);
  if (!decided) return false;
  return finalizeGovernance(g, decided, 'admin');
}

/**
 * Pay the majority voters of a panel-upheld dispute. Pool = rewardShare of the
 * bond, equal integer shares, never above the bond; the remainder stays in
 * escrow. Marked settled only when every share is confirmed paid.
 */
export async function settleRewards(
  g: DisputeGovernance,
  params: GovernanceParams = getGovernanceParams()
): Promise<{ paid: number; pending: number }> {
  const { data: dispute } = await getDisputeById(g.dispute_id);
  if (!dispute || dispute.status !== 'upheld' || g.resolved_by !== 'panel') return { paid: 0, pending: 0 };

  const votesRes = await listVotes(g.dispute_id);
  if (!votesRes.data) return { paid: 0, pending: 1 };
  const winners = majorityVoters(votesRes.data, 'uphold');
  const split = computeRewardSplit(bondToLamports(Number(dispute.bond_amount)), winners.length, params.rewardShareBps);

  if (split.perVoterLamports <= 0) {
    await markRewardsSettled(g.dispute_id);
    return { paid: 0, pending: 0 };
  }

  let paid = 0;
  let pending = 0;
  for (const wallet of winners) {
    const r = await payVoterReward(g.dispute_id, wallet, split.perVoterLamports);
    if (r.status === 'sent' || r.status === 'already_paid') paid++;
    else pending++;
  }
  if (pending === 0) await markRewardsSettled(g.dispute_id);
  return { paid, pending };
}

export interface CycleSummary {
  drawn: number;
  adminFallback: number;
  resolved: number;
  escalated: number;
  payoutPending: number;
  rewardsPaid: number;
  rewardsPending: number;
  errors: number;
}

/**
 * One governance pass (cron and the admin "run" trigger): draw panels for open
 * disputes that have none, resolve due votes, close records the admin already
 * resolved, then settle voter rewards.
 */
export async function runGovernanceCycle(
  now: Date = new Date(),
  params: GovernanceParams = getGovernanceParams()
): Promise<CycleSummary> {
  const s: CycleSummary = {
    drawn: 0,
    adminFallback: 0,
    resolved: 0,
    escalated: 0,
    payoutPending: 0,
    rewardsPaid: 0,
    rewardsPending: 0,
    errors: 0,
  };

  // 1. draw
  const open = await listOpenDisputes();
  if (open.data && open.data.length > 0) {
    const known = await listGovernanceByIds(open.data.map((d) => d.id));
    if (known.data) {
      const have = new Set(known.data.map((k) => k.dispute_id));
      for (const d of open.data.filter((x) => !have.has(x.id)).slice(0, 25)) {
        const r = await drawPanelForDispute(d, { now, params });
        if (r.status === 'panel') s.drawn++;
        else if (r.status === 'admin') s.adminFallback++;
        else if (r.status === 'error') s.errors++;
      }
    } else s.errors++;
  } else if (open.error) s.errors++;

  // 2. resolve due votes
  const voting = await listGovernanceByState('voting');
  if (voting.data) {
    for (const g of voting.data) {
      const o = await processVotingDispute(g, now);
      if (o === 'resolved') s.resolved++;
      else if (o === 'escalated') s.escalated++;
      else if (o === 'payout_pending') s.payoutPending++;
      else if (o === 'error') s.errors++;
    }
  } else s.errors++;

  // 3. close records the admin resolved directly
  for (const state of ['escalated', 'admin'] as const) {
    const rows = await listGovernanceByState(state);
    for (const g of rows.data ?? []) await reconcileClosed(g);
  }

  // 4. voter rewards
  const owing = await listGovernanceNeedingRewards();
  for (const g of owing.data ?? []) {
    const r = await settleRewards(g, params);
    s.rewardsPaid += r.paid;
    s.rewardsPending += r.pending;
  }
  return s;
}

/**
 * Admin override: the admin can always decide, whatever the panel did. The
 * override and its reason are written to the audit log BEFORE anything moves
 * (if the audit write fails nothing is resolved). Money flows through the
 * unchanged resolveDispute path.
 */
export async function adminOverride(input: {
  disputeId: string;
  decision: Vote;
  reason: string;
}): Promise<ResolveResult | { status: 'audit_failed' }> {
  const gov = await getGovernance(input.disputeId);
  if (gov.error) return { status: 'error' };

  const votes = gov.data ? await listVotes(input.disputeId) : { data: [] };
  const audit = await writeAudit(input.disputeId, 'admin_override', 'admin', {
    decision: input.decision,
    reason: input.reason,
    governanceState: gov.data?.state ?? null,
    votesCast: votes.data?.length ?? 0,
  });
  if (audit.error) return { status: 'audit_failed' };

  const result = await resolveDispute(input.disputeId, input.decision);
  if (result.status === 'resolved' && gov.data) {
    const overridingPanel = gov.data.mode === 'panel' && gov.data.state !== 'resolved';
    await finalizeGovernance(gov.data, input.decision, overridingPanel ? 'admin_override' : 'admin');
  }
  return result;
}
