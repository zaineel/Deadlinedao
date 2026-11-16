import { NextResponse } from 'next/server';
import { getAllGoals } from '@/lib/supabase';
import { unsettledGoals } from '@/lib/disputes/logic';

/**
 * GET /api/platform-stats
 * Get real-time platform statistics for the landing page
 */
export async function GET() {
  try {
    // Fetch all goals from the database
    const { data: allGoals, error } = await getAllGoals();

    if (error || !allGoals) {
      return NextResponse.json(
        { error: 'Failed to fetch platform stats' },
        { status: 500 }
      );
    }

    // Calculate stats
    const activeGoals = allGoals.filter(g => g.status === 'active');
    const completedGoals = allGoals.filter(g => g.status === 'completed');
    const failedGoals = allGoals.filter(g => g.status === 'failed');

    // Total staked (sum of all goal stakes)
    const totalStaked = allGoals.reduce((sum, goal) => {
      return sum + parseFloat(goal.stake_amount.toString());
    }, 0);

    // Active goals count
    const activeGoalsCount = activeGoals.length;

    // Success rate calculation
    const totalCompletedOrFailed = completedGoals.length + failedGoals.length;
    const successRate = totalCompletedOrFailed > 0
      ? ((completedGoals.length / totalCompletedOrFailed) * 100)
      : 0;

    // Additional interesting stats
    const totalUsers = new Set(allGoals.map(g => g.wallet_address)).size;
    const totalGoals = allGoals.length;

    return NextResponse.json({
      success: true,
      stats: {
        totalStaked: totalStaked.toFixed(2),
        totalStakedRaw: totalStaked,
        activeGoals: activeGoalsCount,
        successRate: successRate.toFixed(1),
        successRateRaw: successRate,
        completedGoals: completedGoals.length,
        failedGoals: failedGoals.length,
        pendingAppeals: unsettledGoals(allGoals).length,
        totalUsers,
        totalGoals,
      },
      timestamp: new Date().toISOString(),
    }, { status: 200 });

  } catch (error) {
    console.error('Platform stats API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
