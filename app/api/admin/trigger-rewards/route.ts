import { NextRequest, NextResponse } from 'next/server';
import { getAllGoals } from '@/lib/supabase';
import { computeRewardPayouts, sendPayoutFromEscrow } from '@/lib/solana';
import { claimPayout, finalizePayout, releasePayout } from '@/lib/supabase';
import { markPayoutUnconfirmed } from '@/lib/supabase/payouts';
import { requireAdmin } from '@/lib/auth/admin';
import { filterGoalsByDeadlineDay } from '@/lib/deadlines';
import { parseBody, parseValue, dateOnlySchema } from '@/lib/validation/schemas';
import { z } from 'zod';

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
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const parsedBody = await parseBody(request, z.object({ deadline: dateOnlySchema }));
    if (!parsedBody.ok) return parsedBody.response;
    const { deadline } = parsedBody.data;

    // Validate deadline
    if (!deadline) {
      return NextResponse.json(
        { error: 'Deadline is required (format: YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    // Parse and validate date format
    const deadlineDate = new Date(deadline);
    if (typeof deadline !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(deadline) || isNaN(deadlineDate.getTime())) {
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
    const goalsWithDeadline = filterGoalsByDeadlineDay(allGoals, deadline);

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
    // Distribute rewards (Phase 2), one payout per winning goal.
    // Each payout is CLAIMED in the database before SOL is sent, so running
    // this twice (or two admins at once) can never pay the same goal twice.
    const planned = computeRewardPayouts(completedGoals, failedGoals);
    const outcomes: Array<{
      goalId: string;
      recipient: string;
      amount: number;
      status: 'success' | 'already_distributed' | 'unconfirmed' | 'failed';
      signature?: string;
      error?: string;
    }> = [];

    for (const p of planned) {
      const claim = await claimPayout(p.goalId, p.recipient, p.amount, 'completion_reward');

      if (claim.error) {
        outcomes.push({ ...p, status: 'failed', error: 'Could not reserve payout; not sent' });
        continue;
      }
      if (!claim.claimed) {
        outcomes.push({ ...p, status: 'already_distributed' });
        continue;
      }

      const { signature, error, ambiguous } = await sendPayoutFromEscrow(p.recipient, p.amount);
      if (ambiguous) {
        // May have landed: keep the claim so a re-run cannot pay twice.
        if (signature) await markPayoutUnconfirmed(claim.payoutId!, signature);
        outcomes.push({ ...p, status: 'unconfirmed', signature: signature ?? undefined });
        continue;
      }
      if (!signature || error) {
        await releasePayout(claim.payoutId!);
        outcomes.push({ ...p, status: 'failed', error: error?.message || 'Transfer failed' });
        continue;
      }

      await finalizePayout(claim.payoutId!, signature);
      outcomes.push({ ...p, status: 'success', signature });
    }

    const succeeded = outcomes.filter(o => o.status === 'success');
    const alreadyDone = outcomes.filter(o => o.status === 'already_distributed');
    const failedOutcomes = outcomes.filter(o => o.status === 'failed');
    const unconfirmedOutcomes = outcomes.filter(o => o.status === 'unconfirmed');
    console.log(`[Admin] Rewards: ${succeeded.length} sent, ${alreadyDone.length} already distributed, ${failedOutcomes.length} failed`);

    const rewardBreakdown = outcomes.map(o => {
      const goal = completedGoals.find(g => g.id === o.goalId)!;
      return {
        goalId: o.goalId,
        goalDescription: goal.description,
        wallet: o.recipient,
        originalStake: goal.stake_amount,
        rewardAmount: o.amount,
        totalPayout: o.status === 'success' ? o.amount : 0,
        proportion: ((goal.stake_amount / totalCompletedStake) * 100).toFixed(2) + '%',
        status: o.status === 'failed' ? 'failed' : o.status === 'unconfirmed' ? 'unconfirmed' : 'success',
        signature: o.signature || null,
        error: o.error || (o.status === 'already_distributed' ? 'Already distributed earlier' : null),
      };
    });
    const sentTotal = succeeded.reduce((sum, o) => sum + o.amount, 0);

    // Return comprehensive results
    return NextResponse.json({
      success: failedOutcomes.length === 0 && unconfirmedOutcomes.length === 0,
      message: failedOutcomes.length === 0 && unconfirmedOutcomes.length > 0
        ? `${unconfirmedOutcomes.length} payouts are unconfirmed (may have landed). Run POST /api/admin/payouts/reconcile; do not retry them.`
        : failedOutcomes.length === 0
        ? `Distributed ${sentTotal.toFixed(4)} SOL to ${succeeded.length} winners` +
          (alreadyDone.length ? ` (${alreadyDone.length} already paid earlier)` : '')
        : `${failedOutcomes.length} of ${outcomes.length} payouts failed. Safe to re-run: paid goals are skipped.`,
      stats: {
        deadline,
        totalGoals: goalsWithDeadline.length,
        completed: completedGoals.length,
        failed: failedGoals.length,
        active: goalsWithDeadline.filter(g => g.status === 'active').length,
        totalCompletedStake,
        totalFailedStake,
        rewardsDistributed: sentTotal,
      },
      distribution: {
        successfulPayouts: succeeded.length,
        alreadyDistributed: alreadyDone.length,
        failedPayouts: failedOutcomes.length,
        unconfirmedPayouts: unconfirmedOutcomes.length,
        totalWinnersStake: totalCompletedStake,
        totalLosersStake: totalFailedStake,
      },
      rewards: rewardBreakdown,
      errors: failedOutcomes.length > 0 ? failedOutcomes.map(o => `Failed to pay ${o.recipient}: ${o.error}`) : null,
      solanaExplorer: succeeded.map(o => `https://explorer.solana.com/tx/${o.signature}?cluster=devnet`),
    }, { status: 200 });

  } catch (error) {
    console.error('[Admin] Error triggering reward distribution:', error);
    return NextResponse.json(
      {
        error: 'Failed to distribute rewards',
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
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const searchParams = request.nextUrl.searchParams;
    const deadlineResult = parseValue(searchParams.get('deadline'), dateOnlySchema);
    if (!deadlineResult.ok) return deadlineResult.response;
    const deadline = deadlineResult.data;

    // Fetch all goals
    const { data: allGoals, error: goalsError } = await getAllGoals();

    if (goalsError || !allGoals) {
      return NextResponse.json(
        { error: 'Failed to fetch goals' },
        { status: 500 }
      );
    }

    // Filter goals by deadline
    const goalsWithDeadline = filterGoalsByDeadlineDay(allGoals, deadline);

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
