import { supabase, Database } from './client';
import type { Payout } from '@/types';

type PayoutInsert = Database['public']['Tables']['payouts']['Insert'];

/**
 * Create a new payout record
 */
export async function createPayout(payoutData: PayoutInsert): Promise<{ data: Payout | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('payouts')
      .insert(payoutData)
      .select()
      .single();

    if (error) throw error;

    return { data: data as Payout, error: null };
  } catch (error) {
    console.error('Error creating payout:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Create multiple payout records (batch insert)
 */
export async function createPayouts(payoutsData: PayoutInsert[]): Promise<{ data: Payout[] | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('payouts')
      .insert(payoutsData)
      .select();

    if (error) throw error;

    return { data: data as Payout[], error: null };
  } catch (error) {
    console.error('Error creating payouts:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get payout by ID
 */
export async function getPayoutById(payoutId: string): Promise<{ data: Payout | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('payouts')
      .select('*')
      .eq('id', payoutId)
      .single();

    if (error) throw error;

    return { data: data as Payout, error: null };
  } catch (error) {
    console.error('Error fetching payout:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get all payouts for a wallet address
 */
export async function getPayoutsByWallet(
  walletAddress: string,
  filters?: {
    payout_type?: 'completion_reward' | 'original_stake';
    limit?: number;
  }
): Promise<{ data: Payout[] | null; error: Error | null }> {
  try {
    let query = supabase
      .from('payouts')
      .select('*')
      .eq('wallet_address', walletAddress)
      .order('created_at', { ascending: false });

    if (filters?.payout_type) {
      query = query.eq('payout_type', filters.payout_type);
    }

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;

    if (error) throw error;

    return { data: data as Payout[], error: null };
  } catch (error) {
    console.error('Error fetching payouts by wallet:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get payouts for a specific goal
 */
export async function getPayoutsByGoal(goalId: string): Promise<{ data: Payout[] | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('payouts')
      .select('*')
      .eq('goal_id', goalId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return { data: data as Payout[], error: null };
  } catch (error) {
    console.error('Error fetching payouts by goal:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get total payouts for a wallet (sum of all payouts)
 */
export async function getTotalPayoutsForWallet(
  walletAddress: string
): Promise<{ total: number; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('payouts')
      .select('amount')
      .eq('wallet_address', walletAddress);

    if (error) throw error;

    const total = data?.reduce((sum, payout) => sum + Number(payout.amount), 0) || 0;

    return { total, error: null };
  } catch (error) {
    console.error('Error calculating total payouts:', error);
    return { total: 0, error: error as Error };
  }
}

/**
 * Get total rewards earned (completion_reward only)
 */
export async function getTotalRewardsForWallet(
  walletAddress: string
): Promise<{ total: number; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('payouts')
      .select('amount')
      .eq('wallet_address', walletAddress)
      .eq('payout_type', 'completion_reward');

    if (error) throw error;

    const total = data?.reduce((sum, payout) => sum + Number(payout.amount), 0) || 0;

    return { total, error: null };
  } catch (error) {
    console.error('Error calculating total rewards:', error);
    return { total: 0, error: error as Error };
  }
}

/**
 * Get recent payouts (for analytics/dashboard)
 */
export async function getRecentPayouts(limit: number = 10): Promise<{ data: Payout[] | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('payouts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return { data: data as Payout[], error: null };
  } catch (error) {
    console.error('Error fetching recent payouts:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get payouts by type (for analytics)
 */
export async function getPayoutsByType(
  payoutType: 'completion_reward' | 'original_stake',
  limit?: number
): Promise<{ data: Payout[] | null; error: Error | null }> {
  try {
    let query = supabase
      .from('payouts')
      .select('*')
      .eq('payout_type', payoutType)
      .order('created_at', { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) throw error;

    return { data: data as Payout[], error: null };
  } catch (error) {
    console.error('Error fetching payouts by type:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Check if a goal has been paid out
 */
export async function hasPayoutForGoal(goalId: string): Promise<{ hasPayout: boolean; error: Error | null }> {
  try {
    const { count, error } = await supabase
      .from('payouts')
      .select('id', { count: 'exact', head: true })
      .eq('goal_id', goalId);

    if (error) throw error;

    return { hasPayout: (count ?? 0) > 0, error: null };
  } catch (error) {
    console.error('Error checking payout existence:', error);
    return { hasPayout: false, error: error as Error };
  }
}

/**
 * Get payout statistics for a wallet
 */
export async function getWalletPayoutStats(
  walletAddress: string
): Promise<{
  data: {
    totalPayouts: number;
    totalRewards: number;
    totalStakeReturns: number;
    payoutCount: number;
  } | null;
  error: Error | null
}> {
  try {
    const { data, error } = await supabase
      .from('payouts')
      .select('amount, payout_type')
      .eq('wallet_address', walletAddress);

    if (error) throw error;

    const stats = data?.reduce(
      (acc, payout) => {
        const amount = Number(payout.amount);
        acc.totalPayouts += amount;
        acc.payoutCount += 1;

        if (payout.payout_type === 'completion_reward') {
          acc.totalRewards += amount;
        } else {
          acc.totalStakeReturns += amount;
        }

        return acc;
      },
      { totalPayouts: 0, totalRewards: 0, totalStakeReturns: 0, payoutCount: 0 }
    ) || { totalPayouts: 0, totalRewards: 0, totalStakeReturns: 0, payoutCount: 0 };

    return { data: stats, error: null };
  } catch (error) {
    console.error('Error fetching wallet payout stats:', error);
    return { data: null, error: error as Error };
  }
}
