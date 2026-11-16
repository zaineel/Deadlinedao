import { NextRequest, NextResponse } from 'next/server';
import { featureDisabledResponse } from '@/lib/config/features';
import { requireAdmin } from '@/lib/auth/admin';
import { parseBody } from '@/lib/validation/schemas';
import { settleTeamGoalSchema } from '@/lib/validation/teams-schemas';
import { getMemberGoals, getTeamGoal, markTeamGoalSettled, recordTeamRemainder } from '@/lib/supabase/teams';
import { claimPayout, finalizePayout, releasePayout, markPayoutUnconfirmed, getPayoutsByGoal } from '@/lib/supabase/payouts';
import { sendPayoutFromEscrow } from '@/lib/solana/escrow';
import { settleTeamGoal } from '@/lib/teams/settle';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/team-settlement { teamGoalId, dryRun? }
 *
 * Team-first redistribution: forfeited stakes of failed members are split pro
 * rata among teammates who completed ('team_reward' payouts, one claim per
 * member goal). Refuses while any staked member goal is not completed/failed
 * (or before the deadline). Idempotent: re-running skips rewards already
 * claimed and retries ones whose send failed.
 *
 * The undistributed remainder (rounding dust, or the whole team pool when
 * nobody completed) is recorded once on the team goal (remainder_to_global)
 * and joins the global pool of its deadline day in /api/admin/trigger-rewards.
 */
export async function POST(request: NextRequest) {
  const off = featureDisabledResponse('teams');
  if (off) return off;
  const denied = requireAdmin(request);
  if (denied) return denied;

  const parsed = await parseBody(request, settleTeamGoalSchema);
  if (!parsed.ok) return parsed.response;
  const { teamGoalId, dryRun } = parsed.data;

  try {
    const teamGoal = await getTeamGoal(teamGoalId);
    if (!teamGoal) return NextResponse.json({ error: 'Team goal not found' }, { status: 404 });

    const memberGoals = await getMemberGoals([teamGoalId]);
    const result = await settleTeamGoal(
      teamGoal,
      memberGoals,
      {
        claim: (goalId, wallet, amount) => claimPayout(goalId, wallet, amount, 'team_reward'),
        send: sendPayoutFromEscrow,
        finalize: finalizePayout,
        release: (id) => releasePayout(id),
        markUnconfirmed: markPayoutUnconfirmed,
        isUnresolved: async (goalId) => {
          const { data, error } = await getPayoutsByGoal(goalId);
          if (error || !data) return true; // fail closed: do not mark settled
          return data.some(
            (p) => p.payout_type === 'team_reward' && (p.tx_signature === 'pending' || p.tx_signature.startsWith('unconfirmed:'))
          );
        },
      },
      { dryRun }
    );

    if (!result.ok) {
      return NextResponse.json(
        {
          success: false,
          error:
            result.reason === 'deadline_not_reached'
              ? 'Team goal deadline has not passed'
              : 'Some member goals are not in a final status yet',
          reason: result.reason,
          blockingGoalIds: result.blockingGoalIds,
        },
        { status: 409 }
      );
    }

    let settled = teamGoal.status === 'settled';
    if (!dryRun && result.complete) {
      // Record the global-pool remainder once (write-if-null) BEFORE marking settled,
      // so a settled goal always has its remainder; a re-run repairs a crash in between.
      await recordTeamRemainder(teamGoalId, result.remainderToGlobal);
      if (!settled) settled = await markTeamGoalSettled(teamGoalId);
    }

    const failed = result.outcomes.filter((o) => o.status === 'failed').length;
    const unconfirmed = result.outcomes.filter((o) => o.status === 'unconfirmed').length;
    return NextResponse.json({
      success: failed === 0 && unconfirmed === 0,
      dryRun: result.dryRun,
      settled,
      teamPool: result.teamPool,
      distributed: result.distributed,
      remainderToGlobal: result.remainderToGlobal,
      planned: result.planned,
      outcomes: result.outcomes,
      message:
        failed === 0 && unconfirmed > 0
          ? `${unconfirmed} reward(s) are unconfirmed (may have landed). Run POST /api/admin/payouts/reconcile; do not retry them.`
          : failed === 0
          ? 'Team settlement complete'
          : `${failed} reward(s) failed to send. Safe to re-run: paid rewards are skipped.`,
    });
  } catch (error) {
    console.error('[Admin] Error settling team goal:', error);
    return NextResponse.json({ error: 'Failed to settle team goal' }, { status: 500 });
  }
}
