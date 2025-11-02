import { NextRequest, NextResponse } from 'next/server';
import { getAllGoals } from '@/lib/supabase';
import { distributeDeadlineRewards } from '@/lib/solana/payouts';
import { createPayouts } from '@/lib/supabase';

// Vercel configuration
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/trigger-rewards
 * Manually trigger Phase 2 reward distribution for a specific deadline
 *
 * Body: { deadline: "YYYY-MM-DD" }
 *
 * This endpoint:
 * 1. Fetches all goals with the specified deadline
 * 2. Separates completed vs failed goals
 * 3. Calculates and distributes rewards from failed stakes to winners
 * 4. Records all payouts in the database
 * 5. Returns detailed breakdown
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deadline } = body;

    // Validate deadline
    if (!deadline) {
      return NextResponse.json(
        { error: 'Deadline is required (format: YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    // Parse and validate date format
    const deadlineDate = new Date(deadline);
    if (isNaN(deadlineDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      );
    }

    console.log(`[Admin] Triggering reward distribution for deadline: ${deadline}`);

    // Fetch all goals
    const { data: allGoals, error: goalsError } = await getAllGoals();

    if (goalsError || !allGoals) {
      return NextResponse.json(
        { error: 'Failed to fetch goals', details: goalsError?.message },
        { status: 500 }
      );
    }

    // Filter goals by deadline (matching the date only, ignoring time)
    const targetDate = new Date(deadline);
    const goalsWithDeadline = allGoals.filter(goal => {
      const goalDeadline = new Date(goal.deadline);
      return (
        goalDeadline.getFullYear() === targetDate.getFullYear() &&
        goalDeadline.getMonth() === targetDate.getMonth() &&
        goalDeadline.getDate() === targetDate.getDate()
      );
    });

    console.log(`[Admin] Found ${goalsWithDeadline.length} goals with deadline ${deadline}`);

    // Separate completed and failed goals
    const completedGoals = goalsWithDeadline.filter(g => g.status === 'completed');
    const failedGoals = goalsWithDeadline.filter(g => g.status === 'failed');

    console.log(`[Admin] Completed: ${completedGoals.length}, Failed: ${failedGoals.length}`);

    // Validate we have goals to process
    if (completedGoals.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No completed goals found for this deadline',
        stats: {
          deadline,
          totalGoals: goalsWithDeadline.length,
          completed: 0,
          failed: failedGoals.length,
          active: goalsWithDeadline.filter(g => g.status === 'active').length,
        },
      });
    }

    if (failedGoals.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No failed goals found - no rewards to distribute',
        stats: {
          deadline,
          totalGoals: goalsWithDeadline.length,
          completed: completedGoals.length,
          failed: 0,
          active: goalsWithDeadline.filter(g => g.status === 'active').length,
        },
      });
    }

    // Calculate totals
    const totalCompletedStake = completedGoals.reduce((sum, g) => sum + g.stake_amount, 0);
    const totalFailedStake = failedGoals.reduce((sum, g) => sum + g.stake_amount, 0);

    console.log(`[Admin] Total completed stake: ${totalCompletedStake} SOL`);
    console.log(`[Admin] Total failed stake: ${totalFailedStake} SOL`);
    console.log(`[Admin] Calling distributeDeadlineRewards...`);

    // Distribute rewards (Phase 2)
    const result = await distributeDeadlineRewards(completedGoals, failedGoals);

    console.log(`[Admin] Distribution complete. Successful payouts: ${result.payouts.filter(p => p.signature).length}`);

    // Record successful payouts in database
    if (result.payouts.length > 0) {
      const payoutRecords = result.payouts
        .filter(p => p.signature) // Only record successful payouts
        .map(payout => {
          // Find the goal for this recipient
          const goal = completedGoals.find(g => g.wallet_address === payout.recipient);

          return {
            goal_id: goal?.id || 'unknown',
            wallet_address: payout.recipient,
            amount: payout.amount,
            tx_signature: payout.signature!,
            payout_type: payout.type,
          };
        });

      if (payoutRecords.length > 0) {
        const { error: payoutError } = await createPayouts(payoutRecords);

        if (payoutError) {
          console.error('[Admin] Failed to record payouts in database:', payoutError);
        } else {
          console.log(`[Admin] Recorded ${payoutRecords.length} payouts in database`);
        }
      }
    }

    // Calculate reward details for response
    const rewardBreakdown = completedGoals.map(goal => {
      const payout = result.payouts.find(p => p.recipient === goal.wallet_address);
      const proportion = goal.stake_amount / totalCompletedStake;
      const reward = proportion * totalFailedStake;

      return {
        goalId: goal.id,
        goalDescription: goal.description,
        wallet: goal.wallet_address,
        originalStake: goal.stake_amount,
        rewardAmount: reward,
        totalPayout: payout?.amount || 0,
        proportion: (proportion * 100).toFixed(2) + '%',
        status: payout?.signature ? 'success' : 'failed',
        signature: payout?.signature || null,
        error: payout?.error || null,
      };
    });

    // Return comprehensive results
    return NextResponse.json({
      success: true,
      message: `Successfully distributed ${totalFailedStake} SOL in rewards to ${completedGoals.length} winners`,
      stats: {
        deadline,
        totalGoals: goalsWithDeadline.length,
        completed: completedGoals.length,
        failed: failedGoals.length,
        active: goalsWithDeadline.filter(g => g.status === 'active').length,
        totalCompletedStake,
        totalFailedStake,
        rewardsDistributed: totalFailedStake,
      },
      distribution: {
        successfulPayouts: result.payouts.filter(p => p.signature).length,
        failedPayouts: result.payouts.filter(p => p.error).length,
        totalWinnersStake: result.totalWinnersStake,
        totalLosersStake: result.totalLosersStake,
      },
      rewards: rewardBreakdown,
      errors: result.errors.length > 0 ? result.errors : null,
      solanaExplorer: result.payouts
        .filter(p => p.signature)
        .map(p => `https://explorer.solana.com/tx/${p.signature}?cluster=devnet`),
    }, { status: 200 });

  } catch (error) {
    console.error('[Admin] Error triggering reward distribution:', error);
    return NextResponse.json(
      {
        error: 'Failed to distribute rewards',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/trigger-rewards?deadline=YYYY-MM-DD
 * Preview what would be distributed without actually executing
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const deadline = searchParams.get('deadline');

    if (!deadline) {
      return NextResponse.json(
        { error: 'Deadline parameter is required (format: YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    // Fetch all goals
    const { data: allGoals, error: goalsError } = await getAllGoals();

    if (goalsError || !allGoals) {
      return NextResponse.json(
        { error: 'Failed to fetch goals' },
        { status: 500 }
      );
    }

    // Filter goals by deadline
    const targetDate = new Date(deadline);
    const goalsWithDeadline = allGoals.filter(goal => {
      const goalDeadline = new Date(goal.deadline);
      return (
        goalDeadline.getFullYear() === targetDate.getFullYear() &&
        goalDeadline.getMonth() === targetDate.getMonth() &&
        goalDeadline.getDate() === targetDate.getDate()
      );
    });

    // Separate by status
    const completedGoals = goalsWithDeadline.filter(g => g.status === 'completed');
    const failedGoals = goalsWithDeadline.filter(g => g.status === 'failed');
    const activeGoals = goalsWithDeadline.filter(g => g.status === 'active');

    const totalCompletedStake = completedGoals.reduce((sum, g) => sum + g.stake_amount, 0);
    const totalFailedStake = failedGoals.reduce((sum, g) => sum + g.stake_amount, 0);

    // Calculate what each winner would receive
    const preview = completedGoals.map(goal => {
      const proportion = totalCompletedStake > 0 ? goal.stake_amount / totalCompletedStake : 0;
      const reward = proportion * totalFailedStake;

      return {
        goalId: goal.id,
        wallet: goal.wallet_address,
        description: goal.description,
        originalStake: goal.stake_amount,
        rewardAmount: reward,
        proportion: (proportion * 100).toFixed(2) + '%',
      };
    });

    return NextResponse.json({
      preview: true,
      deadline,
      stats: {
        totalGoals: goalsWithDeadline.length,
        completed: completedGoals.length,
        failed: failedGoals.length,
        active: activeGoals.length,
        totalCompletedStake,
        totalFailedStake,
      },
      distribution: preview,
      canDistribute: completedGoals.length > 0 && failedGoals.length > 0,
      note: completedGoals.length === 0 ? 'No completed goals to reward' :
            failedGoals.length === 0 ? 'No failed stakes to distribute' :
            'Ready to distribute rewards',
    });

  } catch (error) {
    console.error('[Admin] Error previewing distribution:', error);
    return NextResponse.json(
      { error: 'Failed to preview distribution' },
      { status: 500 }
    );
  }
}
