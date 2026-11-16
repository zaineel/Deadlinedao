import { supabase } from './client';
import { generateInviteCode } from '@/lib/teams/invite';
import type { MemberGoalRow } from '@/lib/teams/settlement';
import type { TeamRemainderRow } from '@/lib/teams/pool';
import { utcDayRange } from '@/lib/deadlines';

/** DB access for teams. Functions throw on unexpected database errors. */

export interface Team {
  id: string;
  name: string;
  owner_wallet: string;
  invite_code: string;
  created_at: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  wallet_address: string;
  role: 'owner' | 'member';
  joined_at: string;
}

export interface TeamGoal {
  id: string;
  team_id: string;
  title: string;
  description: string;
  category: 'learning' | 'work' | 'health';
  deadline: string;
  stake_per_member: number;
  rule: 'team_first';
  status: 'open' | 'settled';
  created_by: string;
  created_at: string;
  settled_at: string | null;
  remainder_to_global?: number | null;
}

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === '23505';

export async function createTeamWithOwner(name: string, ownerWallet: string): Promise<Team> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from('teams')
      .insert({ name, owner_wallet: ownerWallet, invite_code: generateInviteCode() })
      .select()
      .single();
    if (error && isUniqueViolation(error)) continue; // invite code collision: retry
    if (error) throw error;
    const team = data as Team;
    const { error: memberError } = await supabase
      .from('team_members')
      .insert({ team_id: team.id, wallet_address: ownerWallet, role: 'owner' });
    if (memberError) {
      await supabase.from('teams').delete().eq('id', team.id);
      throw memberError;
    }
    return team;
  }
  throw new Error('Could not allocate an invite code');
}

export async function getTeamById(id: string): Promise<Team | null> {
  const { data, error } = await supabase.from('teams').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Team) ?? null;
}

export async function getTeamByInviteCode(code: string): Promise<Team | null> {
  const { data, error } = await supabase.from('teams').select('*').eq('invite_code', code).maybeSingle();
  if (error) throw error;
  return (data as Team) ?? null;
}

export async function getTeamMembers(teamId: string): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .eq('team_id', teamId)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TeamMember[];
}

/** Returns false when the wallet was already a member (unique violation). */
export async function addTeamMember(teamId: string, wallet: string): Promise<boolean> {
  const { error } = await supabase
    .from('team_members')
    .insert({ team_id: teamId, wallet_address: wallet, role: 'member' });
  if (error && isUniqueViolation(error)) return false;
  if (error) throw error;
  return true;
}

export async function listTeamsForWallet(wallet: string): Promise<Array<Team & { member_count: number }>> {
  const { data: memberships, error } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('wallet_address', wallet);
  if (error) throw error;
  const ids = (memberships ?? []).map((m: { team_id: string }) => m.team_id);
  if (ids.length === 0) return [];
  const { data: teams, error: teamsError } = await supabase.from('teams').select('*').in('id', ids);
  if (teamsError) throw teamsError;
  const { data: all, error: countError } = await supabase.from('team_members').select('team_id').in('team_id', ids);
  if (countError) throw countError;
  const counts = new Map<string, number>();
  for (const r of (all ?? []) as Array<{ team_id: string }>) counts.set(r.team_id, (counts.get(r.team_id) ?? 0) + 1);
  return ((teams ?? []) as Team[]).map((t) => ({ ...t, member_count: counts.get(t.id) ?? 0 }));
}

export async function createTeamGoal(input: {
  team_id: string;
  title: string;
  description: string;
  category: TeamGoal['category'];
  deadline: string;
  stake_per_member: number;
  created_by: string;
}): Promise<TeamGoal> {
  const { data, error } = await supabase.from('team_goals').insert(input).select().single();
  if (error) throw error;
  return data as TeamGoal;
}

export async function getTeamGoal(id: string): Promise<TeamGoal | null> {
  const { data, error } = await supabase.from('team_goals').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as TeamGoal) ?? null;
}

export async function listTeamGoals(teamId: string): Promise<TeamGoal[]> {
  const { data, error } = await supabase
    .from('team_goals')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TeamGoal[];
}

/** All member goal rows linked to the given team goals. */
export async function getMemberGoals(teamGoalIds: string[]): Promise<Array<MemberGoalRow & { team_goal_id: string }>> {
  if (teamGoalIds.length === 0) return [];
  const { data, error } = await supabase
    .from('goals')
    .select('id, wallet_address, stake_amount, stake_tx_signature, status, team_goal_id')
    .in('team_goal_id', teamGoalIds);
  if (error) throw error;
  return (data ?? []) as Array<MemberGoalRow & { team_goal_id: string }>;
}

export async function getMemberGoal(teamGoalId: string, wallet: string): Promise<MemberGoalRow | null> {
  const { data, error } = await supabase
    .from('goals')
    .select('id, wallet_address, stake_amount, stake_tx_signature, status')
    .eq('team_goal_id', teamGoalId)
    .eq('wallet_address', wallet)
    .maybeSingle();
  if (error) throw error;
  return (data as MemberGoalRow) ?? null;
}

/** Returns the new goal id, or null on unique violation (member already has a goal). */
export async function insertMemberGoal(teamGoal: TeamGoal, wallet: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('goals')
    .insert({
      wallet_address: wallet,
      title: teamGoal.title,
      description: teamGoal.description,
      deadline: new Date(teamGoal.deadline).toISOString(),
      category: teamGoal.category,
      stake_amount: teamGoal.stake_per_member,
      stake_tx_signature: 'pending',
      status: 'pending_validation',
      team_goal_id: teamGoal.id,
    })
    .select('id')
    .single();
  if (error && isUniqueViolation(error)) return null;
  if (error) throw error;
  return (data as { id: string }).id;
}

/** Atomically open -> settled. Returns false when it was not open. */
export async function markTeamGoalSettled(id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('team_goals')
    .update({ status: 'settled', settled_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'open')
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}

/**
 * Records a team goal's remainder exactly once (write-if-null). Re-running
 * settlement can never change or double it. Returns true if this call wrote it.
 */
export async function recordTeamRemainder(id: string, amount: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('team_goals')
    .update({ remainder_to_global: amount })
    .eq('id', id)
    .is('remainder_to_global', null)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** Team goals whose deadline falls on the given UTC day (YYYY-MM-DD). */
export async function getTeamGoalRemaindersForDay(dateKey: string): Promise<TeamRemainderRow[]> {
  const { start, end } = utcDayRange(dateKey);
  const { data, error } = await supabase
    .from('team_goals')
    .select('id, status, remainder_to_global')
    .gte('deadline', start)
    .lt('deadline', end);
  if (error) throw error;
  return (data ?? []) as TeamRemainderRow[];
}
