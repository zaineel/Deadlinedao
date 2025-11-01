import { NextRequest, NextResponse } from 'next/server';
import { getUserStats, getGoalsByWallet, getPayoutsByWallet } from '@/lib/supabase';

/**
 * GET /api/analytics/user/[wallet]
 * Get user-specific statistics
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { wallet: string } }
) {
  try {
    const { wallet } = params;

    // Get user stats
    const { data: userStats, error: statsError } = await getUserStats(wallet);

    if (statsError) {
      return NextResponse.json(
        { error: 'Failed to fetch user stats' },
        { status: 500 }
      );
    }

    // Get recent goals
    const { data: recentGoals, error: goalsError } = await getGoalsByWallet(
      wallet,
      { limit: 10 }
    );

    // Get recent payouts
    const { data: recentPayouts, error: payoutsError } = await getPayoutsByWallet(
      wallet,
      { limit: 10 }
    );

    return NextResponse.json({
      success: true,
      wallet,
      stats: userStats,
      recent_goals: recentGoals || [],
      recent_payouts: recentPayouts || [],
    });

  } catch (error) {
    console.error('User analytics error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
