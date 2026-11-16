import { NextRequest, NextResponse } from 'next/server';
import { featureDisabledResponse } from '@/lib/config/features';
import { requireSession } from '@/lib/auth/session';
import { rateLimit } from '@/lib/rate-limit';
import { parseBody } from '@/lib/validation/schemas';
import { createTeamGoalSchema } from '@/lib/validation/teams-schemas';
import { createTeamGoal, getTeamById } from '@/lib/supabase/teams';
import { isOwner } from '@/lib/teams/membership';

export const runtime = 'nodejs';

/** POST /api/team-goals: the team owner defines a goal; members stake via /api/team-goals/[id]/join. */
export async function POST(request: NextRequest) {
  const off = featureDisabledResponse('teams');
  if (off) return off;
  const limited = rateLimit(request, { name: 'team-goals-create', limit: 10, windowMs: 60_000 });
  if (limited) return limited;
  const session = requireSession(request);
  if (!session.ok) return session.response;

  const parsed = await parseBody(request, createTeamGoalSchema);
  if (!parsed.ok) return parsed.response;
  const { teamId, title, description, category, deadline, stakePerMember } = parsed.data;

  try {
    const team = await getTeamById(teamId);
    if (!team || !isOwner(team, session.wallet)) {
      // Same answer for "missing" and "not yours".
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }
    const teamGoal = await createTeamGoal({
      team_id: teamId,
      title,
      description,
      category,
      deadline: new Date(deadline).toISOString(),
      stake_per_member: stakePerMember,
      created_by: session.wallet,
    });
    return NextResponse.json({ success: true, teamGoal }, { status: 201 });
  } catch (error) {
    console.error('Error creating team goal:', error);
    return NextResponse.json({ error: 'Failed to create team goal' }, { status: 500 });
  }
}
