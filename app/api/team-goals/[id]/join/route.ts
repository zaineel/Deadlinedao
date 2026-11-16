import { NextRequest, NextResponse } from 'next/server';
import { featureDisabledResponse } from '@/lib/config/features';
import { isDemoMode } from '@/lib/config/demo';
import { requireSession } from '@/lib/auth/session';
import { rateLimit } from '@/lib/rate-limit';
import { parseValue, uuidSchema } from '@/lib/validation/schemas';
import {
  getMemberGoal,
  getTeamGoal,
  getTeamMembers,
  insertMemberGoal,
} from '@/lib/supabase/teams';
import { canStakeOnTeamGoal } from '@/lib/teams/membership';
import { hasStaked } from '@/lib/teams/settlement';
import { buildStakeTransaction } from '@/lib/teams/stake-tx';

export const runtime = 'nodejs';

/**
 * POST /api/team-goals/[id]/join
 * A team member stakes on a team goal. Creates the member's individual goals row
 * (team_goal_id set, status pending_validation, stake_tx_signature 'pending') and
 * returns the unsigned stake transfer. The client signs/sends it and then calls
 * the existing POST /api/goals/confirm with { goalId, signature }.
 * Calling again before confirming re-issues the transaction for the same goal.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const off = featureDisabledResponse('teams');
  if (off) return off;
  const limited = rateLimit(request, { name: 'team-goals-join', limit: 10, windowMs: 60_000 });
  if (limited) return limited;
  const session = requireSession(request);
  if (!session.ok) return session.response;

  const idResult = parseValue((await params).id, uuidSchema);
  if (!idResult.ok) return idResult.response;

  try {
    const teamGoal = await getTeamGoal(idResult.data);
    const members = teamGoal ? await getTeamMembers(teamGoal.team_id) : [];
    const existing = teamGoal ? await getMemberGoal(teamGoal.id, session.wallet) : null;

    // Non-members cannot tell a team goal exists.
    if (!teamGoal || !members.some((m) => m.wallet_address === session.wallet)) {
      return NextResponse.json({ error: 'Team goal not found' }, { status: 404 });
    }

    const decision = canStakeOnTeamGoal({
      members,
      wallet: session.wallet,
      teamGoal,
      alreadyStaked: !!existing && hasStaked(existing),
    });
    if (!decision.ok) {
      const messages = {
        not_member: 'Team goal not found',
        team_goal_closed: 'This team goal is closed',
        deadline_passed: 'The deadline has passed',
        already_staked: 'You have already staked on this team goal',
      } as const;
      return NextResponse.json(
        { error: messages[decision.reason] },
        { status: decision.reason === 'not_member' ? 404 : 409 }
      );
    }

    let goalId = existing?.id ?? null;
    if (!goalId) {
      goalId = await insertMemberGoal(teamGoal, session.wallet);
      if (!goalId) return NextResponse.json({ error: 'You have already joined this team goal' }, { status: 409 });
    }

    if (isDemoMode()) {
      return NextResponse.json({ success: true, goalId, demoMode: true });
    }

    const { transaction, escrowAddress } = await buildStakeTransaction(
      session.wallet,
      Number(teamGoal.stake_per_member)
    );
    return NextResponse.json({
      success: true,
      goalId,
      transaction,
      escrowAddress,
      message: 'Sign the transaction, then confirm it with /api/goals/confirm.',
    });
  } catch (error) {
    console.error('Error staking on team goal:', error);
    return NextResponse.json({ error: 'Failed to join team goal' }, { status: 500 });
  }
}
