import { NextRequest, NextResponse } from 'next/server';
import { featureDisabledResponse } from '@/lib/config/features';
import { requireSession } from '@/lib/auth/session';
import { parseValue, uuidSchema } from '@/lib/validation/schemas';
import { getMemberGoals, getTeamById, getTeamMembers, listTeamGoals } from '@/lib/supabase/teams';
import { isMember } from '@/lib/teams/membership';
import { buildTeamGoalProgress } from '@/lib/teams/progress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/teams/[id]: team detail with per-member progress. Members only. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const off = featureDisabledResponse('teams');
  if (off) return off;
  const session = requireSession(request);
  if (!session.ok) return session.response;

  const idResult = parseValue((await params).id, uuidSchema);
  if (!idResult.ok) return idResult.response;

  try {
    const team = await getTeamById(idResult.data);
    const members = team ? await getTeamMembers(team.id) : [];
    // Non-members get the same 404 as a missing team: existence is not revealed.
    if (!team || !isMember(members, session.wallet)) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const goals = await listTeamGoals(team.id);
    const memberGoals = await getMemberGoals(goals.map((g) => g.id));
    const wallets = members.map((m) => m.wallet_address);

    return NextResponse.json({
      success: true,
      team: {
        id: team.id,
        name: team.name,
        owner_wallet: team.owner_wallet,
        invite_code: team.invite_code,
        created_at: team.created_at,
      },
      isOwner: team.owner_wallet === session.wallet,
      members: members.map((m) => ({ wallet: m.wallet_address, role: m.role, joined_at: m.joined_at })),
      goals: goals.map((g) => ({
        ...g,
        progress: buildTeamGoalProgress(
          wallets,
          memberGoals.filter((mg) => mg.team_goal_id === g.id)
        ),
        myGoalId: memberGoals.find((mg) => mg.team_goal_id === g.id && mg.wallet_address === session.wallet)?.id ?? null,
      })),
    });
  } catch (error) {
    console.error('Error loading team:', error);
    return NextResponse.json({ error: 'Failed to load team' }, { status: 500 });
  }
}
