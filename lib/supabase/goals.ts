import { supabase, Database } from './client';
import type { Goal } from '@/types';

type GoalInsert = Database['public']['Tables']['goals']['Insert'];
type GoalUpdate = Database['public']['Tables']['goals']['Update'];

/**
 * Create a new goal
 */
export async function createGoal(goalData: GoalInsert): Promise<{ data: Goal | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('goals')
      .insert(goalData)
      .select()
      .single();

    if (error) throw error;

    return { data: data as Goal, error: null };
  } catch (error) {
    console.error('Error creating goal:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get goal by ID
 */
export async function getGoalById(goalId: string): Promise<{ data: Goal | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('id', goalId)
      .single();

    if (error) throw error;

    return { data: data as Goal, error: null };
  } catch (error) {
    console.error('Error fetching goal:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get all goals for a wallet address
 */
export async function getGoalsByWallet(
  walletAddress: string,
  filters?: {
    status?: Goal['status'];
    category?: Goal['category'];
    limit?: number;
  }
): Promise<{ data: Goal[] | null; error: Error | null }> {
  try {
    let query = supabase
      .from('goals')
      .select('*')
      .eq('wallet_address', walletAddress)
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.category) {
      query = query.eq('category', filters.category);
    }

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;

    if (error) throw error;

    return { data: data as Goal[], error: null };
  } catch (error) {
    console.error('Error fetching goals by wallet:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get all active goals (for checking deadlines)
 */
export async function getActiveGoals(): Promise<{ data: Goal[] | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('status', 'active')
      .order('deadline', { ascending: true });

    if (error) throw error;

    return { data: data as Goal[], error: null };
  } catch (error) {
    console.error('Error fetching active goals:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get goals that have passed their deadline and need to be marked as failed
 */
export async function getExpiredGoals(): Promise<{ data: Goal[] | null; error: Error | null }> {
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('status', 'active')
      .lt('deadline', now);

    if (error) throw error;

    return { data: data as Goal[], error: null };
  } catch (error) {
    console.error('Error fetching expired goals:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Update goal status
 */
export async function updateGoalStatus(
  goalId: string,
  status: Goal['status']
): Promise<{ data: Goal | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('goals')
      .update({ status })
      .eq('id', goalId)
      .select()
      .single();

    if (error) throw error;

    return { data: data as Goal, error: null };
  } catch (error) {
    console.error('Error updating goal status:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Update goal (generic update)
 */
export async function updateGoal(
  goalId: string,
  updates: GoalUpdate
): Promise<{ data: Goal | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('goals')
      .update(updates)
      .eq('id', goalId)
      .select()
      .single();

    if (error) throw error;

    return { data: data as Goal, error: null };
  } catch (error) {
    console.error('Error updating goal:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Delete goal (soft delete by updating status)
 * Note: Hard deletes are not recommended due to foreign key constraints with proofs and payouts
 */
export async function deleteGoal(goalId: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from('goals')
      .delete()
      .eq('id', goalId);

    if (error) throw error;

    return { error: null };
  } catch (error) {
    console.error('Error deleting goal:', error);
    return { error: error as Error };
  }
}

/**
 * Get goals by category (for analytics/filtering)
 */
export async function getGoalsByCategory(
  category: Goal['category'],
  limit?: number
): Promise<{ data: Goal[] | null; error: Error | null }> {
  try {
    let query = supabase
      .from('goals')
      .select('*')
      .eq('category', category)
      .order('created_at', { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) throw error;

    return { data: data as Goal[], error: null };
  } catch (error) {
    console.error('Error fetching goals by category:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get recent goals (for landing page/dashboard)
 */
export async function getRecentGoals(limit: number = 10): Promise<{ data: Goal[] | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return { data: data as Goal[], error: null };
  } catch (error) {
    console.error('Error fetching recent goals:', error);
    return { data: null, error: error as Error };
  }
}
