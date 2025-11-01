import { NextResponse } from 'next/server';
import {
  getPlatformStats,
  getStatsByCategory,
  getAIValidationStats,
  getLeaderboard,
} from '@/lib/supabase';
import { getAIMetrics } from '@/lib/snowflake';

/**
 * GET /api/analytics/platform
 * Get platform-wide statistics
 */
export async function GET() {
  try {
    // Get platform stats from Supabase
    const { data: platformStats, error: platformError } = await getPlatformStats();

    if (platformError) {
      return NextResponse.json(
        { error: 'Failed to fetch platform stats' },
        { status: 500 }
      );
    }

    // Get category breakdown
    const { data: categoryStats, error: categoryError } = await getStatsByCategory();

    // Get AI validation stats from Supabase
    const { data: aiValidationStats, error: aiError } = await getAIValidationStats();

    // Get AI performance metrics from Snowflake
    const aiMetrics = getAIMetrics(60); // Last hour

    // Get leaderboard
    const { data: leaderboard, error: leaderboardError } = await getLeaderboard(10);

    return NextResponse.json({
      success: true,
      platform: platformStats,
      categories: categoryStats || {},
      ai_validation: aiValidationStats,
      ai_performance: {
        last_hour: aiMetrics,
      },
      leaderboard: leaderboard || [],
    });

  } catch (error) {
    console.error('Platform analytics error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
