import { NextRequest, NextResponse } from 'next/server';
import { featureDisabledResponse } from '@/lib/config/features';
import { requireSession } from '@/lib/auth/session';
import { rateLimit } from '@/lib/rate-limit';
import { parseBody } from '@/lib/validation/schemas';
import { createTeamSchema } from '@/lib/validation/teams-schemas';
import { createTeamWithOwner, listTeamsForWallet } from '@/lib/supabase/teams';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/teams: create a team; the session wallet becomes its owner. */
export async function POST(request: NextRequest) {
  const off = featureDisabledResponse('teams');
  if (off) return off;
  const limited = rateLimit(request, { name: 'teams-create', limit: 10, windowMs: 60_000 });
  if (limited) return limited;
  const session = requireSession(request);
  if (!session.ok) return session.response;

  const parsed = await parseBody(request, createTeamSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const team = await createTeamWithOwner(parsed.data.name, session.wallet);
    return NextResponse.json({ success: true, team }, { status: 201 });
  } catch (error) {
    console.error('Error creating team:', error);
    return NextResponse.json({ error: 'Failed to create team' }, { status: 500 });
  }
}

/** GET /api/teams: teams the session wallet belongs to. */
export async function GET(request: NextRequest) {
  const off = featureDisabledResponse('teams');
  if (off) return off;
  const session = requireSession(request);
  if (!session.ok) return session.response;

  try {
    const teams = await listTeamsForWallet(session.wallet);
    return NextResponse.json({ success: true, teams });
  } catch (error) {
    console.error('Error listing teams:', error);
    return NextResponse.json({ error: 'Failed to load teams' }, { status: 500 });
  }
}
