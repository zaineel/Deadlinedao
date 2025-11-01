import { supabase } from './client';

/**
 * Platform-wide statistics and analytics
 */

/**
 * Get overall platform statistics
 */
export async function getPlatformStats(): Promise<{
  data: {
    totalGoals: number;
    activeGoals: number;
    completedGoals: number;
    failedGoals: number;
    totalStaked: number;
    totalPayouts: number;
    totalUsers: number;
    avgCompletionRate: number;
  } | null;
  error: Error | null;
}> {
  try {
    // Get goal counts
    const { count: totalGoals, error: goalsError } = await supabase
      .from('goals')
      .select('*', { count: 'exact', head: true });

    if (goalsError) throw goalsError;

    const { count: activeGoals, error: activeError } = await supabase
      .from('goals')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    if (activeError) throw activeError;

    const { count: completedGoals, error: completedError } = await supabase
      .from('goals')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed');

    if (completedError) throw completedError;

    const { count: failedGoals, error: failedError } = await supabase
      .from('goals')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed');

    if (failedError) throw failedError;

    // Get total staked amount
    const { data: stakeData, error: stakeError } = await supabase
      .from('goals')
      .select('stake_amount');

    if (stakeError) throw stakeError;

    const totalStaked = stakeData?.reduce((sum, goal) => sum + Number(goal.stake_amount), 0) || 0;

    // Get total payouts
    const { data: payoutData, error: payoutError } = await supabase
      .from('payouts')
      .select('amount');

    if (payoutError) throw payoutError;

    const totalPayouts = payoutData?.reduce((sum, payout) => sum + Number(payout.amount), 0) || 0;

    // Get unique users count
    const { data: usersData, error: usersError } = await supabase
      .from('goals')
      .select('wallet_address');

    if (usersError) throw usersError;

    const uniqueUsers = new Set(usersData?.map(g => g.wallet_address) || []);
    const totalUsers = uniqueUsers.size;

    // Calculate completion rate
    const finishedGoals = (completedGoals || 0) + (failedGoals || 0);
    const avgCompletionRate = finishedGoals > 0
      ? ((completedGoals || 0) / finishedGoals) * 100
      : 0;

    return {
      data: {
        totalGoals: totalGoals || 0,
        activeGoals: activeGoals || 0,
        completedGoals: completedGoals || 0,
        failedGoals: failedGoals || 0,
        totalStaked,
        totalPayouts,
        totalUsers,
        avgCompletionRate: Math.round(avgCompletionRate * 100) / 100,
      },
      error: null,
    };
  } catch (error) {
    console.error('Error fetching platform stats:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get statistics by category
 */
export async function getStatsByCategory(): Promise<{
  data: {
    learning: { total: number; completed: number; completionRate: number };
    work: { total: number; completed: number; completionRate: number };
    health: { total: number; completed: number; completionRate: number };
  } | null;
  error: Error | null;
}> {
  try {
    const categories = ['learning', 'work', 'health'] as const;
    const stats: any = {};

    for (const category of categories) {
      const { count: total, error: totalError } = await supabase
        .from('goals')
        .select('*', { count: 'exact', head: true })
        .eq('category', category);

      if (totalError) throw totalError;

      const { count: completed, error: completedError } = await supabase
        .from('goals')
        .select('*', { count: 'exact', head: true })
        .eq('category', category)
        .eq('status', 'completed');

      if (completedError) throw completedError;

      const completionRate = (total || 0) > 0 ? ((completed || 0) / (total || 0)) * 100 : 0;

      stats[category] = {
        total: total || 0,
        completed: completed || 0,
        completionRate: Math.round(completionRate * 100) / 100,
      };
    }

    return { data: stats, error: null };
  } catch (error) {
    console.error('Error fetching stats by category:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get user statistics (for dashboard)
 */
export async function getUserStats(walletAddress: string): Promise<{
  data: {
    totalGoals: number;
    activeGoals: number;
    completedGoals: number;
    failedGoals: number;
    totalStaked: number;
    totalEarned: number;
    totalReturned: number;
    netProfit: number;
    successRate: number;
  } | null;
  error: Error | null;
}> {
  try {
    // Get goal counts
    const { count: totalGoals, error: totalError } = await supabase
      .from('goals')
      .select('*', { count: 'exact', head: true })
      .eq('wallet_address', walletAddress);

    if (totalError) throw totalError;

    const { count: activeGoals, error: activeError } = await supabase
      .from('goals')
      .select('*', { count: 'exact', head: true })
      .eq('wallet_address', walletAddress)
      .eq('status', 'active');

    if (activeError) throw activeError;

    const { count: completedGoals, error: completedError } = await supabase
      .from('goals')
      .select('*', { count: 'exact', head: true })
      .eq('wallet_address', walletAddress)
      .eq('status', 'completed');

    if (completedError) throw completedError;

    const { count: failedGoals, error: failedError } = await supabase
      .from('goals')
      .select('*', { count: 'exact', head: true })
      .eq('wallet_address', walletAddress)
      .eq('status', 'failed');

    if (failedError) throw failedError;

    // Get total staked
    const { data: stakeData, error: stakeError } = await supabase
      .from('goals')
      .select('stake_amount')
      .eq('wallet_address', walletAddress);

    if (stakeError) throw stakeError;

    const totalStaked = stakeData?.reduce((sum, goal) => sum + Number(goal.stake_amount), 0) || 0;

    // Get payout data
    const { data: payoutData, error: payoutError } = await supabase
      .from('payouts')
      .select('amount, payout_type')
      .eq('wallet_address', walletAddress);

    if (payoutError) throw payoutError;

    const payoutStats = payoutData?.reduce(
      (acc, payout) => {
        const amount = Number(payout.amount);
        if (payout.payout_type === 'completion_reward') {
          acc.totalEarned += amount;
        } else {
          acc.totalReturned += amount;
        }
        return acc;
      },
      { totalEarned: 0, totalReturned: 0 }
    ) || { totalEarned: 0, totalReturned: 0 };

    const netProfit = payoutStats.totalEarned + payoutStats.totalReturned - totalStaked;

    // Calculate success rate
    const finishedGoals = (completedGoals || 0) + (failedGoals || 0);
    const successRate = finishedGoals > 0
      ? ((completedGoals || 0) / finishedGoals) * 100
      : 0;

    return {
      data: {
        totalGoals: totalGoals || 0,
        activeGoals: activeGoals || 0,
        completedGoals: completedGoals || 0,
        failedGoals: failedGoals || 0,
        totalStaked,
        totalEarned: payoutStats.totalEarned,
        totalReturned: payoutStats.totalReturned,
        netProfit,
        successRate: Math.round(successRate * 100) / 100,
      },
      error: null,
    };
  } catch (error) {
    console.error('Error fetching user stats:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get AI validation statistics
 */
export async function getAIValidationStats(): Promise<{
  data: {
    totalProofs: number;
    approvedProofs: number;
    rejectedProofs: number;
    needsReview: number;
    avgConfidence: number;
    avgQualityScore: number;
    approvalRate: number;
  } | null;
  error: Error | null;
}> {
  try {
    const { count: totalProofs, error: totalError } = await supabase
      .from('proofs')
      .select('*', { count: 'exact', head: true });

    if (totalError) throw totalError;

    const { count: approvedProofs, error: approvedError } = await supabase
      .from('proofs')
      .select('*', { count: 'exact', head: true })
      .eq('ai_verdict', 'approved');

    if (approvedError) throw approvedError;

    const { count: rejectedProofs, error: rejectedError } = await supabase
      .from('proofs')
      .select('*', { count: 'exact', head: true })
      .eq('ai_verdict', 'rejected');

    if (rejectedError) throw rejectedError;

    const { count: needsReview, error: reviewError } = await supabase
      .from('proofs')
      .select('*', { count: 'exact', head: true })
      .eq('ai_verdict', 'needs_review');

    if (reviewError) throw reviewError;

    // Get average confidence and quality scores
    const { data: proofsData, error: proofsError } = await supabase
      .from('proofs')
      .select('ai_confidence, quality_score')
      .not('ai_confidence', 'is', null)
      .not('quality_score', 'is', null);

    if (proofsError) throw proofsError;

    const avgConfidence = proofsData && proofsData.length > 0
      ? proofsData.reduce((sum, p) => sum + Number(p.ai_confidence), 0) / proofsData.length
      : 0;

    const avgQualityScore = proofsData && proofsData.length > 0
      ? proofsData.reduce((sum, p) => sum + Number(p.quality_score), 0) / proofsData.length
      : 0;

    // Calculate approval rate
    const processedProofs = (approvedProofs || 0) + (rejectedProofs || 0);
    const approvalRate = processedProofs > 0
      ? ((approvedProofs || 0) / processedProofs) * 100
      : 0;

    return {
      data: {
        totalProofs: totalProofs || 0,
        approvedProofs: approvedProofs || 0,
        rejectedProofs: rejectedProofs || 0,
        needsReview: needsReview || 0,
        avgConfidence: Math.round(avgConfidence * 100) / 100,
        avgQualityScore: Math.round(avgQualityScore * 100) / 100,
        approvalRate: Math.round(approvalRate * 100) / 100,
      },
      error: null,
    };
  } catch (error) {
    console.error('Error fetching AI validation stats:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get leaderboard (top users by completion rate and earnings)
 */
export async function getLeaderboard(limit: number = 10): Promise<{
  data: Array<{
    wallet_address: string;
    completedGoals: number;
    totalEarned: number;
    successRate: number;
  }> | null;
  error: Error | null;
}> {
  try {
    // Get all unique wallet addresses
    const { data: goalsData, error: goalsError } = await supabase
      .from('goals')
      .select('wallet_address, status');

    if (goalsError) throw goalsError;

    const { data: payoutsData, error: payoutsError } = await supabase
      .from('payouts')
      .select('wallet_address, amount, payout_type');

    if (payoutsError) throw payoutsError;

    // Aggregate data by wallet
    const walletMap = new Map<string, { completed: number; total: number; earned: number }>();

    goalsData?.forEach(goal => {
      const current = walletMap.get(goal.wallet_address) || { completed: 0, total: 0, earned: 0 };
      current.total += 1;
      if (goal.status === 'completed') {
        current.completed += 1;
      }
      walletMap.set(goal.wallet_address, current);
    });

    payoutsData?.forEach(payout => {
      if (payout.payout_type === 'completion_reward') {
        const current = walletMap.get(payout.wallet_address);
        if (current) {
          current.earned += Number(payout.amount);
          walletMap.set(payout.wallet_address, current);
        }
      }
    });

    // Convert to array and calculate success rate
    const leaderboard = Array.from(walletMap.entries())
      .map(([wallet_address, stats]) => ({
        wallet_address,
        completedGoals: stats.completed,
        totalEarned: stats.earned,
        successRate: stats.total > 0 ? (stats.completed / stats.total) * 100 : 0,
      }))
      .sort((a, b) => b.totalEarned - a.totalEarned)
      .slice(0, limit);

    return { data: leaderboard, error: null };
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get trending goals (recently created, high stakes)
 */
export async function getTrendingGoals(limit: number = 10): Promise<{
  data: Array<{
    id: string;
    title: string;
    category: string;
    stake_amount: number;
    deadline: string;
    created_at: string;
  }> | null;
  error: Error | null;
}> {
  try {
    const { data, error } = await supabase
      .from('goals')
      .select('id, title, category, stake_amount, deadline, created_at')
      .eq('status', 'active')
      .order('stake_amount', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return { data: data as any, error: null };
  } catch (error) {
    console.error('Error fetching trending goals:', error);
    return { data: null, error: error as Error };
  }
}
