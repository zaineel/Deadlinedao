import { filterGoalsByDeadlineDay } from '@/lib/deadlines';
import { NextRequest, NextResponse } from 'next/server';
import { getAllGoals } from '@/lib/supabase';
import { isFeatureEnabled } from '@/lib/config/features';
import { getTeamGoalRemaindersForDay } from '@/lib/supabase/teams';
import { excludeTeamGoals, sumTeamRemainders } from '@/lib/teams/pool';
import { unsettledGoals } from '@/lib/disputes/logic';

/**
 * GET /api/prize-pool?deadline=YYYY-MM-DD
 * Get prize pool information for a specific deadline
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const deadlineParam = searchParams.get('deadline');

    if (!deadlineParam) {
      return NextResponse.json(
        { error: 'deadline parameter is required (YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    const targetDeadline = new Date(deadlineParam);

    // Fetch all goals
    const { data: allGoals, error } = await getAllGoals();

    if (error || !allGoals) {
      return NextResponse.json(
        { error: 'Failed to fetch goals' },
        { status: 500 }
      );
    }

    // Filter goals by matching deadline (same day)
    // Team member goals are settled separately; they are not part of the global pool.
    const goalsForDeadline = excludeTeamGoals(filterGoalsByDeadlineDay(allGoals, deadlineParam));
    const teamRemainder = isFeatureEnabled('teams')
      ? sumTeamRemainders(await getTeamGoalRemaindersForDay(deadlineParam))
      : 0;

    // Separate by status
    const activeGoals = goalsForDeadline.filter(g => g.status === 'active');
    const completedGoals = goalsForDeadline.filter(g => g.status === 'completed');
    const failedGoals = goalsForDeadline.filter(g => g.status === 'failed');

    // Calculate prize pool (failed stakes)
    const prizePool = failedGoals.reduce((sum, g) => sum + parseFloat(g.stake_amount.toString()), 0) + teamRemainder;

    // Calculate total active stakes (potential winners)
    const totalActiveStakes = activeGoals.reduce((sum, g) => sum + parseFloat(g.stake_amount.toString()), 0);

    // Get unique competing users
    const competingUsers = Array.from(
      new Set(activeGoals.map(g => g.wallet_address))
    );

    // Calculate potential payout for each competitor
    const competitors = competingUsers.map(wallet => {
      const userGoals = activeGoals.filter(g => g.wallet_address === wallet);
      const userStake = userGoals.reduce((sum, g) => sum + parseFloat(g.stake_amount.toString()), 0);

      // Potential payout if they're the only winner
      const maxPayout = userStake + prizePool + totalActiveStakes - userStake;

      // Expected payout if everyone succeeds (just stake back)
      const minPayout = userStake;

      return {
        wallet: wallet,
        totalStake: userStake,
        goalCount: userGoals.length,
        minPayout,
        maxPayout,
      };
    });

    return NextResponse.json({
      success: true,
      deadline: targetDeadline.toISOString(),
      statistics: {
        totalGoals: goalsForDeadline.length,
        activeGoals: activeGoals.length,
        completedGoals: completedGoals.length,
        failedGoals: failedGoals.length,
        pendingAppeals: unsettledGoals(goalsForDeadline).length,
      },
      prizePool: {
        totalPrizePool: prizePool,
        totalActiveStakes: totalActiveStakes,
        totalPotential: prizePool + totalActiveStakes,
      },
      competition: {
        totalCompetitors: competingUsers.length,
        competitors: competitors,
      },
      goals: {
        active: activeGoals.map(g => ({
          id: g.id,
          title: g.title,
          wallet: g.wallet_address,
          stake: g.stake_amount,
          category: g.category,
        })),
        completed: completedGoals.length,
        failed: failedGoals.length,
      },
    }, { status: 200 });

  } catch (error) {
    console.error('Prize pool API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
