import { supabase } from './client';
import type { GovernanceState, Vote } from '@/lib/governance/logic';

export interface DisputeGovernance {
  dispute_id: string;
  mode: 'panel' | 'admin';
  state: GovernanceState;
  fallback_reason: string | null;
  panel_size: number;
  quorum: number;
  eligible_count: number;
  drawn_at: string;
  voting_ends_at: string | null;
  escalated_reason: string | null;
  decision: Vote | null;
  resolved_by: 'panel' | 'admin' | 'admin_override' | null;
  resolved_at: string | null;
  stats_applied: boolean;
  rewards_settled: boolean;
}

export interface DisputeVote {
  dispute_id: string;
  voter_wallet: string;
  vote: Vote;
  reason: string | null;
  created_at: string;
}

export interface VoterStats {
  votes_cast: number;
  votes_agreed: number;
  votes_missed: number;
}

export type RewardStatus = 'claimed' | 'paid' | 'unconfirmed';
export interface GovernanceReward {
  id: string;
  dispute_id: string;
  voter_wallet: string;
  amount_lamports: number;
  tx_signature: string | null;
  status: RewardStatus;
}

type Result<T> = Promise<{ data: T | null; error: Error | null }>;

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === '23505';
const isMissingTable = (e: unknown) => {
  const code = (e as { code?: string } | null)?.code;
  return code === '42P01' || code === 'PGRST205';
};
const err = (e: unknown) => (e as Error | null) ?? null;

/* ---------- governance state ---------- */

export async function getGovernance(disputeId: string): Result<DisputeGovernance> {
  const { data, error } = await supabase
    .from('dispute_governance')
    .select('*')
    .eq('dispute_id', disputeId)
    .maybeSingle();
  return { data: (data as DisputeGovernance | null) ?? null, error: err(error) };
}

export async function listGovernanceByIds(ids: string[]): Result<DisputeGovernance[]> {
  if (ids.length === 0) return { data: [], error: null };
  const { data, error } = await supabase.from('dispute_governance').select('*').in('dispute_id', ids);
  return { data: (data as DisputeGovernance[] | null) ?? null, error: err(error) };
}

export async function listGovernanceByState(state: GovernanceState): Result<DisputeGovernance[]> {
  const { data, error } = await supabase
    .from('dispute_governance')
    .select('*')
    .eq('state', state)
    .order('drawn_at', { ascending: true })
    .limit(200);
  return { data: (data as DisputeGovernance[] | null) ?? null, error: err(error) };
}

/** Resolved panel-upheld disputes whose voter rewards are not fully settled yet. */
export async function listGovernanceNeedingRewards(): Result<DisputeGovernance[]> {
  const { data, error } = await supabase
    .from('dispute_governance')
    .select('*')
    .eq('state', 'resolved')
    .eq('resolved_by', 'panel')
    .eq('decision', 'uphold')
    .eq('rewards_settled', false)
    .limit(100);
  return { data: (data as DisputeGovernance[] | null) ?? null, error: err(error) };
}

/**
 * Record the draw. The PRIMARY KEY on dispute_id makes this idempotent: only
 * one caller can create the record (and then the panel); `duplicate` means it
 * already exists. If the panel insert fails the record is removed so a retry
 * can draw again.
 */
export async function createGovernanceWithPanel(input: {
  dispute_id: string;
  mode: 'panel' | 'admin';
  fallback_reason: string | null;
  panel_size: number;
  quorum: number;
  eligible_count: number;
  drawn_at: Date;
  voting_ends_at: Date | null;
  panel: string[];
}): Promise<{ created: boolean; duplicate: boolean; error: Error | null }> {
  const { error } = await supabase.from('dispute_governance').insert({
    dispute_id: input.dispute_id,
    mode: input.mode,
    state: input.mode === 'panel' ? 'voting' : 'admin',
    fallback_reason: input.fallback_reason,
    panel_size: input.panel_size,
    quorum: input.quorum,
    eligible_count: input.eligible_count,
    drawn_at: input.drawn_at.toISOString(),
    voting_ends_at: input.voting_ends_at ? input.voting_ends_at.toISOString() : null,
  });
  if (error && isUniqueViolation(error)) return { created: false, duplicate: true, error: null };
  if (error) return { created: false, duplicate: false, error: err(error) };

  if (input.panel.length > 0) {
    const { error: pErr } = await supabase.from('dispute_panels').insert(
      input.panel.map((wallet) => ({
        dispute_id: input.dispute_id,
        wallet,
        drawn_at: input.drawn_at.toISOString(),
      }))
    );
    if (pErr) {
      await supabase.from('dispute_governance').delete().eq('dispute_id', input.dispute_id);
      return { created: false, duplicate: false, error: err(pErr) };
    }
  }
  return { created: true, duplicate: false, error: null };
}

/** Conditional state change; returns true only for the caller that flipped it. */
export async function updateGovernanceState(
  disputeId: string,
  fromStates: GovernanceState[],
  patch: Partial<Pick<DisputeGovernance, 'state' | 'escalated_reason' | 'decision' | 'resolved_by'>> & {
    resolved_at?: string;
  }
): Promise<{ changed: boolean; error: Error | null }> {
  const { data, error } = await supabase
    .from('dispute_governance')
    .update(patch)
    .eq('dispute_id', disputeId)
    .in('state', fromStates)
    .select('dispute_id');
  return { changed: (data?.length ?? 0) > 0, error: err(error) };
}

/** Flip stats_applied false -> true exactly once. */
export async function claimStatsApplication(disputeId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('dispute_governance')
    .update({ stats_applied: true })
    .eq('dispute_id', disputeId)
    .eq('stats_applied', false)
    .select('dispute_id');
  return !error && (data?.length ?? 0) > 0;
}

export async function markRewardsSettled(disputeId: string): Promise<void> {
  const { error } = await supabase
    .from('dispute_governance')
    .update({ rewards_settled: true })
    .eq('dispute_id', disputeId);
  if (error) console.error('[Governance] could not mark rewards settled:', error);
}

/* ---------- panels and votes ---------- */

export async function listPanel(disputeId: string): Result<string[]> {
  const { data, error } = await supabase.from('dispute_panels').select('wallet').eq('dispute_id', disputeId);
  return { data: data ? (data as Array<{ wallet: string }>).map((r) => r.wallet) : null, error: err(error) };
}

export async function listPanelDisputeIds(wallet: string): Result<string[]> {
  const { data, error } = await supabase
    .from('dispute_panels')
    .select('dispute_id')
    .eq('wallet', wallet)
    .order('drawn_at', { ascending: false })
    .limit(100);
  return {
    data: data ? (data as Array<{ dispute_id: string }>).map((r) => r.dispute_id) : null,
    error: err(error),
  };
}

export async function isPanelist(disputeId: string, wallet: string): Promise<{ is: boolean; error: Error | null }> {
  const { data, error } = await supabase
    .from('dispute_panels')
    .select('wallet')
    .eq('dispute_id', disputeId)
    .eq('wallet', wallet)
    .maybeSingle();
  return { is: Boolean(data), error: err(error) };
}

export async function getVote(disputeId: string, wallet: string): Result<DisputeVote> {
  const { data, error } = await supabase
    .from('dispute_votes')
    .select('*')
    .eq('dispute_id', disputeId)
    .eq('voter_wallet', wallet)
    .maybeSingle();
  return { data: (data as DisputeVote | null) ?? null, error: err(error) };
}

export async function listVotes(disputeId: string): Result<DisputeVote[]> {
  const { data, error } = await supabase.from('dispute_votes').select('*').eq('dispute_id', disputeId);
  return { data: (data as DisputeVote[] | null) ?? null, error: err(error) };
}

export async function insertVote(input: {
  dispute_id: string;
  voter_wallet: string;
  vote: Vote;
  reason: string | null;
}): Promise<{ inserted: boolean; duplicate: boolean; error: Error | null }> {
  const { error } = await supabase.from('dispute_votes').insert(input);
  if (error && isUniqueViolation(error)) return { inserted: false, duplicate: true, error: null };
  return { inserted: !error, duplicate: false, error: err(error) };
}

/* ---------- stats ---------- */

export async function getVoterStats(wallet: string): Promise<{ data: VoterStats; error: Error | null }> {
  const { data, error } = await supabase
    .from('governance_voter_stats')
    .select('votes_cast, votes_agreed, votes_missed')
    .eq('wallet', wallet)
    .maybeSingle();
  return {
    data: (data as VoterStats | null) ?? { votes_cast: 0, votes_agreed: 0, votes_missed: 0 },
    error: err(error),
  };
}

export async function bumpVoterStats(
  deltas: Array<{ wallet: string; cast: number; agreed: number; missed: number }>
): Promise<void> {
  for (const d of deltas) {
    const { error } = await supabase.rpc('governance_bump_stats', {
      p_wallet: d.wallet,
      p_cast: d.cast,
      p_agreed: d.agreed,
      p_missed: d.missed,
    });
    if (error) console.error('[Governance] stats update failed:', error);
  }
}

/* ---------- rewards (claim-before-send) ---------- */

export async function getReward(disputeId: string, wallet: string): Result<GovernanceReward> {
  const { data, error } = await supabase
    .from('governance_rewards')
    .select('*')
    .eq('dispute_id', disputeId)
    .eq('voter_wallet', wallet)
    .maybeSingle();
  return { data: (data as GovernanceReward | null) ?? null, error: err(error) };
}

/** Insert the claim row. claimed=false means someone already holds the claim (paid or in flight). */
export async function claimReward(
  disputeId: string,
  wallet: string,
  amountLamports: number
): Promise<{ claimed: boolean; rewardId: string | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('governance_rewards')
    .insert({ dispute_id: disputeId, voter_wallet: wallet, amount_lamports: amountLamports, status: 'claimed' })
    .select('id')
    .single();
  if (error && isUniqueViolation(error)) return { claimed: false, rewardId: null, error: null };
  if (error) return { claimed: false, rewardId: null, error: err(error) };
  return { claimed: true, rewardId: (data as { id: string }).id, error: null };
}

export async function finalizeReward(rewardId: string, signature: string): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('governance_rewards')
    .update({ status: 'paid', tx_signature: signature })
    .eq('id', rewardId);
  if (error) console.error(`CRITICAL: reward ${rewardId} was sent (${signature}) but could not be recorded:`, error);
  return { error: err(error) };
}

export async function markRewardUnconfirmed(rewardId: string, signature: string | null): Promise<void> {
  const { error } = await supabase
    .from('governance_rewards')
    .update({ status: 'unconfirmed', tx_signature: signature })
    .eq('id', rewardId);
  if (error) console.error(`CRITICAL: reward ${rewardId} is ambiguous and could not be marked:`, error);
}

/** Definite failure only: drop the claim so a later run can retry. Only a still-'claimed' row is released. */
export async function releaseReward(rewardId: string): Promise<void> {
  const { error } = await supabase.from('governance_rewards').delete().eq('id', rewardId).eq('status', 'claimed');
  if (error) console.error(`Failed to release reward claim ${rewardId}:`, error);
}

export async function listRewardsByWallet(wallet: string): Result<GovernanceReward[]> {
  const { data, error } = await supabase
    .from('governance_rewards')
    .select('*')
    .eq('voter_wallet', wallet)
    .order('created_at', { ascending: false })
    .limit(50);
  return { data: (data as GovernanceReward[] | null) ?? null, error: err(error) };
}

/* ---------- audit ---------- */

export async function writeAudit(
  disputeId: string | null,
  action: string,
  actor: string,
  detail: Record<string, unknown>
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('governance_audit')
    .insert({ dispute_id: disputeId, action, actor, detail });
  return { error: err(error) };
}

/* ---------- eligibility inputs ---------- */

const MAX_ROWS = 50_000;

/** wallet -> completed goal count. */
export async function getCompletedGoalCounts(): Promise<{ data: Map<string, number> | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('goals')
    .select('wallet_address')
    .eq('status', 'completed')
    .limit(MAX_ROWS);
  if (error || !data) return { data: null, error: err(error) ?? new Error('query failed') };
  const counts = new Map<string, number>();
  for (const row of data as Array<{ wallet_address: string }>) {
    counts.set(row.wallet_address, (counts.get(row.wallet_address) ?? 0) + 1);
  }
  return { data: counts, error: null };
}

/** Wallets with an undecided rejection or open dispute of their own. */
export async function getWalletsWithPendingDispute(): Promise<{ data: Set<string> | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('goals')
    .select('wallet_address')
    .in('status', ['rejected_appealable', 'disputed'])
    .limit(MAX_ROWS);
  if (error || !data) return { data: null, error: err(error) ?? new Error('query failed') };
  return { data: new Set((data as Array<{ wallet_address: string }>).map((r) => r.wallet_address)), error: null };
}

/**
 * Wallets that share a team or an org with `owner`. A missing teams/orgs
 * table (feature never migrated) means no such relationships; any other DB
 * error fails closed (returned as an error so nobody is drawn on partial data).
 */
export async function getConflictedWallets(owner: string): Promise<{ data: Set<string> | null; error: Error | null }> {
  const out = new Set<string>();

  const teams = await supabase.from('team_members').select('team_id').eq('wallet_address', owner);
  if (teams.error && !isMissingTable(teams.error)) return { data: null, error: err(teams.error) };
  const teamIds = ((teams.data as Array<{ team_id: string }> | null) ?? []).map((r) => r.team_id);
  if (teamIds.length > 0) {
    const mates = await supabase.from('team_members').select('wallet_address').in('team_id', teamIds);
    if (mates.error) return { data: null, error: err(mates.error) };
    for (const r of (mates.data as Array<{ wallet_address: string }>) ?? []) out.add(r.wallet_address);
  }

  const orgs = await supabase.from('org_members').select('org_id').eq('wallet', owner);
  if (orgs.error && !isMissingTable(orgs.error)) return { data: null, error: err(orgs.error) };
  const orgIds = ((orgs.data as Array<{ org_id: string }> | null) ?? []).map((r) => r.org_id);
  if (orgIds.length > 0) {
    const mates = await supabase.from('org_members').select('wallet').in('org_id', orgIds);
    if (mates.error) return { data: null, error: err(mates.error) };
    for (const r of (mates.data as Array<{ wallet: string }>) ?? []) out.add(r.wallet);
    // org admins are conflicted too
    const admins = await supabase.from('organizations').select('admin_wallets').in('id', orgIds);
    if (admins.error) return { data: null, error: err(admins.error) };
    for (const r of (admins.data as Array<{ admin_wallets: string[] }>) ?? []) {
      for (const w of r.admin_wallets ?? []) out.add(w);
    }
  }
  return { data: out, error: null };
}

/* ---------- reward reconciliation ---------- */

export interface UnconfirmedReward extends GovernanceReward {
  created_at: string;
}

/** Rewards left 'unconfirmed' after an ambiguous send (oldest first). */
export async function listUnconfirmedRewards(limit = 50): Result<UnconfirmedReward[]> {
  const { data, error } = await supabase
    .from('governance_rewards')
    .select('*')
    .eq('status', 'unconfirmed')
    .order('created_at', { ascending: true })
    .limit(limit);
  return { data: (data as UnconfirmedReward[] | null) ?? null, error: err(error) };
}

/** Reconcile found the transfer never landed: drop the unconfirmed claim so a later run can retry. */
export async function releaseUnconfirmedReward(rewardId: string): Promise<void> {
  const { error } = await supabase.from('governance_rewards').delete().eq('id', rewardId).eq('status', 'unconfirmed');
  if (error) console.error(`Failed to release unconfirmed reward ${rewardId}:`, error);
}
