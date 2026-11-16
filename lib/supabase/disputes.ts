import { supabase } from './client';
import type { Goal } from '@/types';
import type { DisputeStatus } from '@/lib/disputes/logic';

export interface Dispute {
  id: string;
  goal_id: string;
  proof_id: string | null;
  reason: string;
  extra_image_url: string | null;
  bond_amount: number;
  bond_tx_signature: string;
  status: DisputeStatus;
  resolved_at: string | null;
  created_at: string;
}

type Result<T> = Promise<{ data: T | null; error: Error | null }>;

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === '23505';

export async function getDisputeById(id: string): Result<Dispute> {
  const { data, error } = await supabase.from('disputes').select('*').eq('id', id).maybeSingle();
  return { data: (data as Dispute | null) ?? null, error: error as Error | null };
}

export async function getDisputeByGoal(goalId: string): Result<Dispute> {
  const { data, error } = await supabase.from('disputes').select('*').eq('goal_id', goalId).maybeSingle();
  return { data: (data as Dispute | null) ?? null, error: error as Error | null };
}

export async function getDisputeBySignature(signature: string): Result<Dispute> {
  const { data, error } = await supabase
    .from('disputes')
    .select('*')
    .eq('bond_tx_signature', signature)
    .maybeSingle();
  return { data: (data as Dispute | null) ?? null, error: error as Error | null };
}

/** True when a goal's stake transaction used this signature (a stake tx must not double as a bond). */
export async function isStakeSignature(signature: string): Promise<{ used: boolean; error: Error | null }> {
  const { data, error } = await supabase
    .from('goals')
    .select('id')
    .eq('stake_tx_signature', signature)
    .limit(1);
  return { used: (data?.length ?? 0) > 0, error: error as Error | null };
}

export async function createDispute(input: {
  goal_id: string;
  proof_id: string | null;
  reason: string;
  extra_image_url: string | null;
  bond_amount: number;
  bond_tx_signature: string;
}): Promise<{ data: Dispute | null; duplicate: boolean; error: Error | null }> {
  const { data, error } = await supabase.from('disputes').insert(input).select().single();
  if (error && isUniqueViolation(error)) return { data: null, duplicate: true, error: null };
  return { data: (data as Dispute | null) ?? null, duplicate: false, error: error as Error | null };
}

export async function listDisputesByGoalIds(goalIds: string[]): Result<Dispute[]> {
  if (goalIds.length === 0) return { data: [], error: null };
  const { data, error } = await supabase
    .from('disputes')
    .select('*')
    .in('goal_id', goalIds)
    .order('created_at', { ascending: false });
  return { data: (data as Dispute[] | null) ?? null, error: error as Error | null };
}

export async function listOpenDisputes(): Result<Dispute[]> {
  const { data, error } = await supabase
    .from('disputes')
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: true });
  return { data: (data as Dispute[] | null) ?? null, error: error as Error | null };
}

/**
 * Mark an OPEN dispute resolved. Returns `finalized: true` only for the one
 * caller that actually flipped it, so side effects (notifications) fire once.
 */
export async function finalizeDispute(
  id: string,
  status: Exclude<DisputeStatus, 'open'>
): Promise<{ finalized: boolean; error: Error | null }> {
  const { data, error } = await supabase
    .from('disputes')
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'open')
    .select('id');
  return { finalized: (data?.length ?? 0) > 0, error: error as Error | null };
}

export async function deleteDispute(id: string): Promise<void> {
  const { error } = await supabase.from('disputes').delete().eq('id', id).eq('status', 'open');
  if (error) console.error(`Failed to delete dispute ${id}:`, error);
}

/**
 * Atomically open the appeal window: active -> rejected_appealable and set the
 * deadline in the same statement. Returns null data when the goal was no
 * longer 'active'.
 */
export async function openAppealWindow(goalId: string, appealDeadline: Date): Result<Goal> {
  const { data, error } = await supabase
    .from('goals')
    .update({ status: 'rejected_appealable', appeal_deadline: appealDeadline.toISOString() })
    .eq('id', goalId)
    .eq('status', 'active')
    .select();
  return { data: data && data.length > 0 ? (data[0] as Goal) : null, error: error as Error | null };
}

/** Goals whose appeal window has closed without a dispute. */
export async function getGoalsWithClosedAppealWindow(now: Date): Result<Array<Pick<Goal, 'id'>>> {
  const { data, error } = await supabase
    .from('goals')
    .select('id')
    .eq('status', 'rejected_appealable')
    .lte('appeal_deadline', now.toISOString());
  return { data: (data as Array<Pick<Goal, 'id'>> | null) ?? null, error: error as Error | null };
}
