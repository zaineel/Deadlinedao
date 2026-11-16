import { NextRequest, NextResponse } from 'next/server';
import { featureDisabledResponse } from '@/lib/config/features';
import { requireSession } from '@/lib/auth/session';
import { rateLimit } from '@/lib/rate-limit';
import { parseBody } from '@/lib/validation/schemas';
import { joinTeamSchema } from '@/lib/validation/teams-schemas';
import { addTeamMember, getTeamByInviteCode, getTeamMembers } from '@/lib/supabase/teams';
import { canJoinTeam } from '@/lib/teams/membership';

export const runtime = 'nodejs';

/** POST /api/teams/join { inviteCode }: join a team by invite code. */
export async function POST(request: NextRequest) {
  const off = featureDisabledResponse('teams');
  if (off) return off;
  // Tight limit: invite codes must not be brute-forceable.
  const limited = rateLimit(request, { name: 'teams-join', limit: 10, windowMs: 60_000 });
  if (limited) return limited;
  const session = requireSession(request);
  if (!session.ok) return session.response;

  const parsed = await parseBody(request, joinTeamSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const team = await getTeamByInviteCode(parsed.data.inviteCode);
    if (!team) return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 });

    const members = await getTeamMembers(team.id);
    const decision = canJoinTeam(members, session.wallet);
    if (!decision.ok) {
      return NextResponse.json(
        { error: decision.reason === 'team_full' ? 'Team is full' : 'Already a member' },
        { status: 409 }
      );
    }
    const added = await addTeamMember(team.id, session.wallet);
    if (!added) return NextResponse.json({ error: 'Already a member' }, { status: 409 });

    return NextResponse.json({ success: true, teamId: team.id, name: team.name });
  } catch (error) {
    console.error('Error joining team:', error);
    return NextResponse.json({ error: 'Failed to join team' }, { status: 500 });
  }
}
