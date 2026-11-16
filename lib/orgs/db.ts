import { randomBytes } from 'crypto';
import { supabase } from '@/lib/supabase/client';

/** Database access for the orgs feature. Row shapes mirror 005_orgs.sql. */

export interface OrgRow {
  id: string;
  name: string;
  admin_wallets: string[];
  invite_code: string;
  created_at: string;
}

export interface PoolRow {
  org_id: string;
  funded_lamports: number;
  remaining_lamports: number;
  withdrawn_lamports: number;
  match_rate_bps: number;
  per_member_cap_lamports: number;
  window_start: string;
  window_end: string;
}

export interface MemberRow {
  id: string;
  org_id: string;
  wallet: string;
  joined_at: string;
  consent_aggregate: boolean;
  matched_lamports: number;
}

export interface DbResult<T> {
  data: T | null;
  error: Error | null;
}

const fail = <T>(error: unknown): DbResult<T> => ({ data: null, error: error as Error });

export async function getOrg(orgId: string): Promise<DbResult<OrgRow>> {
  const { data, error } = await supabase.from('organizations').select('*').eq('id', orgId).maybeSingle();
  if (error) return fail(error);
  return { data: (data as OrgRow | null) ?? null, error: null };
}

export async function getPool(orgId: string): Promise<DbResult<PoolRow>> {
  const { data, error } = await supabase.from('org_pools').select('*').eq('org_id', orgId).maybeSingle();
  if (error) return fail(error);
  return { data: (data as PoolRow | null) ?? null, error: null };
}

export async function createOrg(input: {
  name: string;
  adminWallets: string[];
  matchRateBps: number;
  perMemberCapLamports: number;
  windowStart: string;
  windowEnd: string;
}): Promise<DbResult<OrgRow>> {
  const inviteCode = randomBytes(18).toString('base64url');
  const { data, error } = await supabase
    .from('organizations')
    .insert({ name: input.name, admin_wallets: input.adminWallets, invite_code: inviteCode })
    .select('*')
    .single();
  if (error) return fail(error);
  const org = data as OrgRow;

  const { error: poolError } = await supabase.from('org_pools').insert({
    org_id: org.id,
    match_rate_bps: input.matchRateBps,
    per_member_cap_lamports: input.perMemberCapLamports,
    window_start: input.windowStart,
    window_end: input.windowEnd,
  });
  if (poolError) {
    await supabase.from('organizations').delete().eq('id', org.id);
    return fail(poolError);
  }
  return { data: org, error: null };
}

/** Orgs the wallet administers or belongs to. */
export async function listOrgsForWallet(wallet: string): Promise<
  DbResult<Array<{ org: OrgRow; pool: PoolRow | null; membership: MemberRow | null; isAdmin: boolean }>>
> {
  const [admin, member] = await Promise.all([
    supabase.from('organizations').select('*').contains('admin_wallets', [wallet]),
    supabase.from('org_members').select('*').eq('wallet', wallet),
  ]);
  if (admin.error) return fail(admin.error);
  if (member.error) return fail(member.error);

  const memberships = (member.data ?? []) as MemberRow[];
  const adminOrgs = (admin.data ?? []) as OrgRow[];
  const ids = new Set<string>([...adminOrgs.map((o) => o.id), ...memberships.map((m) => m.org_id)]);
  if (ids.size === 0) return { data: [], error: null };

  const [orgs, pools] = await Promise.all([
    supabase.from('organizations').select('*').in('id', [...ids]),
    supabase.from('org_pools').select('*').in('org_id', [...ids]),
  ]);
  if (orgs.error) return fail(orgs.error);
  if (pools.error) return fail(pools.error);

  const poolMap = new Map(((pools.data ?? []) as PoolRow[]).map((p) => [p.org_id, p]));
  const memMap = new Map(memberships.map((m) => [m.org_id, m]));
  const adminIds = new Set(adminOrgs.map((o) => o.id));
  return {
    data: ((orgs.data ?? []) as OrgRow[]).map((org) => ({
      org,
      pool: poolMap.get(org.id) ?? null,
      membership: memMap.get(org.id) ?? null,
      isAdmin: adminIds.has(org.id),
    })),
    error: null,
  };
}

export async function joinOrgByInvite(
  inviteCode: string,
  wallet: string
): Promise<DbResult<{ orgId: string; orgName: string; alreadyMember: boolean }>> {
  const { data: org, error } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('invite_code', inviteCode)
    .maybeSingle();
  if (error) return fail(error);
  if (!org) return { data: null, error: null };

  const { data: existing, error: existingError } = await supabase
    .from('org_members')
    .select('id')
    .eq('org_id', org.id)
    .eq('wallet', wallet)
    .maybeSingle();
  if (existingError) return fail(existingError);
  if (existing) return { data: { orgId: org.id, orgName: org.name, alreadyMember: true }, error: null };

  // consent defaults to false; unique (org_id, wallet) guards a concurrent join
  const { error: insertError } = await supabase.from('org_members').insert({ org_id: org.id, wallet });
  if (insertError && (insertError as { code?: string }).code !== '23505') return fail(insertError);
  return { data: { orgId: org.id, orgName: org.name, alreadyMember: !!insertError }, error: null };
}

export async function getMembership(orgId: string, wallet: string): Promise<DbResult<MemberRow>> {
  const { data, error } = await supabase
    .from('org_members')
    .select('*')
    .eq('org_id', orgId)
    .eq('wallet', wallet)
    .maybeSingle();
  if (error) return fail(error);
  return { data: (data as MemberRow | null) ?? null, error: null };
}

export async function setConsent(orgId: string, wallet: string, consent: boolean): Promise<DbResult<boolean>> {
  const { data, error } = await supabase
    .from('org_members')
    .update({ consent_aggregate: consent })
    .eq('org_id', orgId)
    .eq('wallet', wallet)
    .select('id');
  if (error) return fail(error);
  return { data: (data?.length ?? 0) > 0, error: null };
}

/** Member headcounts only; never wallets. */
export async function countMembers(orgId: string): Promise<DbResult<{ total: number; consenting: number }>> {
  const [all, consenting] = await Promise.all([
    supabase.from('org_members').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase
      .from('org_members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('consent_aggregate', true),
  ]);
  if (all.error) return fail(all.error);
  if (consenting.error) return fail(consenting.error);
  return { data: { total: all.count ?? 0, consenting: consenting.count ?? 0 }, error: null };
}

export type FundResult =
  | { status: 'credited'; remainingLamports: number }
  | { status: 'duplicate' }
  | { status: 'pool_closed' }
  | { status: 'error' };

export async function creditFunding(
  orgId: string,
  wallet: string,
  signature: string,
  lamports: number
): Promise<FundResult> {
  const { data, error } = await supabase.rpc('org_fund_pool', {
    p_org: orgId,
    p_wallet: wallet,
    p_signature: signature,
    p_lamports: lamports,
  });
  if (!error) return { status: 'credited', remainingLamports: Number(data) };
  if ((error as { code?: string }).code === '23505') return { status: 'duplicate' };
  if (/pool_closed/.test(error.message)) return { status: 'pool_closed' };
  console.error('creditFunding failed:', error);
  return { status: 'error' };
}

export async function fundingSignatureUsed(signature: string): Promise<boolean> {
  const [f, g] = await Promise.all([
    supabase.from('org_fundings').select('id').eq('tx_signature', signature).maybeSingle(),
    supabase.from('goals').select('id').eq('stake_tx_signature', signature).maybeSingle(),
  ]);
  return !!f.data || !!g.data;
}

/** Atomic reservation. Returns the org_matches id, or null if refused. */
export async function reserveMatch(
  orgId: string,
  wallet: string,
  goalId: string,
  amountLamports: number
): Promise<DbResult<string>> {
  const { data, error } = await supabase.rpc('org_reserve_match', {
    p_org: orgId,
    p_wallet: wallet,
    p_goal: goalId,
    p_amount: amountLamports,
  });
  if (error) return fail(error);
  return { data: (data as string | null) ?? null, error: null };
}

export async function releaseMatch(matchId: string): Promise<void> {
  const { error } = await supabase.rpc('org_release_match', { p_match: matchId });
  if (error) console.error(`Failed to release org match ${matchId}:`, error);
}

export async function markMatchPaid(matchId: string, txSignature: string): Promise<void> {
  const { error } = await supabase
    .from('org_matches')
    .update({ status: 'paid', tx_signature: txSignature })
    .eq('id', matchId);
  if (error) console.error(`CRITICAL: org match ${matchId} was sent (${txSignature}) but could not be recorded:`, error);
}

export type WithdrawClaim =
  | { ok: true; id: string; amountLamports: number }
  | { ok: false; reason: string };

export async function claimWithdrawal(orgId: string, wallet: string): Promise<WithdrawClaim> {
  const { data, error } = await supabase.rpc('org_claim_withdrawal', { p_org: orgId, p_wallet: wallet });
  if (error || !data) {
    console.error('claimWithdrawal failed:', error);
    return { ok: false, reason: 'error' };
  }
  const r = data as { ok: boolean; reason?: string; id?: string; amount?: number };
  if (!r.ok) return { ok: false, reason: r.reason ?? 'error' };
  return { ok: true, id: r.id as string, amountLamports: Number(r.amount) };
}

export async function releaseWithdrawal(id: string): Promise<void> {
  const { error } = await supabase.rpc('org_release_withdrawal', { p_id: id });
  if (error) console.error(`Failed to release org withdrawal ${id}:`, error);
}

export async function finalizeWithdrawal(id: string, txSignature: string): Promise<void> {
  const { error } = await supabase.from('org_withdrawals').update({ tx_signature: txSignature }).eq('id', id);
  if (error) console.error(`CRITICAL: org withdrawal ${id} was sent (${txSignature}) but could not be recorded:`, error);
}

/**
 * Raw inputs for aggregate stats. Selects ONLY non-identifying goal columns and
 * only for consenting members; titles, descriptions and proofs are never read.
 */
export async function loadStatsInputs(orgId: string): Promise<
  DbResult<{
    members: Array<{ wallet: string; joined_at: string; consent: boolean }>;
    goals: Array<{ wallet_address: string; status: string; created_at: string; stake_amount: number }>;
    matches: Array<{ wallet: string; amount_lamports: number }>;
  }>
> {
  const { data: members, error } = await supabase
    .from('org_members')
    .select('wallet, joined_at, consent_aggregate')
    .eq('org_id', orgId)
    .eq('consent_aggregate', true);
  if (error) return fail(error);
  const wallets = (members ?? []).map((m) => m.wallet as string);
  if (wallets.length === 0) return { data: { members: [], goals: [], matches: [] }, error: null };

  const [goals, matches] = await Promise.all([
    supabase.from('goals').select('wallet_address, status, created_at, stake_amount').in('wallet_address', wallets),
    supabase.from('org_matches').select('wallet, amount_lamports').eq('org_id', orgId).in('wallet', wallets),
  ]);
  if (goals.error) return fail(goals.error);
  if (matches.error) return fail(matches.error);

  return {
    data: {
      members: (members ?? []).map((m) => ({
        wallet: m.wallet as string,
        joined_at: m.joined_at as string,
        consent: m.consent_aggregate as boolean,
      })),
      goals: (goals.data ?? []) as Array<{
        wallet_address: string;
        status: string;
        created_at: string;
        stake_amount: number;
      }>,
      matches: (matches.data ?? []) as Array<{ wallet: string; amount_lamports: number }>,
    },
    error: null,
  };
}
