import { NextRequest, NextResponse } from 'next/server';
import { featureDisabledResponse } from '@/lib/config/features';
import { requireSession } from '@/lib/auth/session';
import { rateLimit } from '@/lib/rate-limit';
import { parseBody } from '@/lib/validation/schemas';
import { joinOrgSchema } from '@/lib/validation/orgs-schemas';
import { joinOrgByInvite } from '@/lib/orgs/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/orgs/join { inviteCode }
 * Joins the session wallet to the org. Consent to aggregate stats starts OFF.
 * Matching only applies to goals created after joining.
 */
export async function POST(request: NextRequest) {
  const disabled = featureDisabledResponse('orgs');
  if (disabled) return disabled;
  const session = requireSession(request);
  if (!session.ok) return session.response;
  // tight limit: invite codes must not be brute-forceable
  const limited = rateLimit(request, { name: 'orgs-join', limit: 10, windowMs: 10 * 60_000, key: session.wallet });
  if (limited) return limited;

  const parsed = await parseBody(request, joinOrgSchema);
  if (!parsed.ok) return parsed.response;

  const { data, error } = await joinOrgByInvite(parsed.data.inviteCode, session.wallet);
  if (error) {
    console.error('POST /api/orgs/join failed:', error);
    return NextResponse.json({ error: 'Failed to join' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 });
  return NextResponse.json({ success: true, orgId: data.orgId, orgName: data.orgName, alreadyMember: data.alreadyMember });
}
