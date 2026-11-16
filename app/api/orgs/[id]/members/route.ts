import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { parseBody } from '@/lib/validation/schemas';
import { consentSchema } from '@/lib/validation/orgs-schemas';
import { countMembers, getMembership, setConsent } from '@/lib/orgs/db';
import { orgRouteGuard } from '@/lib/orgs/route-helpers';
import { isOrgAdmin } from '@/lib/orgs/funding';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/orgs/[id]/members
 * Members get their own membership. Admins get headcounts ONLY (never a list
 * of wallets or per-person data).
 */
export async function GET(request: NextRequest, { params }: Ctx) {
  const guard = await orgRouteGuard(request, (await params).id, { requireAdmin: false });
  if (!guard.ok) return guard.response;

  const { data: membership } = await getMembership(guard.orgId, guard.wallet);
  const admin = isOrgAdmin(guard.org.admin_wallets, guard.wallet);
  if (!membership && !admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body: Record<string, unknown> = {
    membership: membership ? { joinedAt: membership.joined_at, consent: membership.consent_aggregate } : null,
  };
  if (admin) {
    const counts = await countMembers(guard.orgId);
    if (counts.data) body.headcount = counts.data;
  }
  return NextResponse.json(body);
}

/** PUT /api/orgs/[id]/members { consent }: a member sets their OWN aggregate-stats consent. */
export async function PUT(request: NextRequest, { params }: Ctx) {
  const guard = await orgRouteGuard(request, (await params).id, { requireAdmin: false });
  if (!guard.ok) return guard.response;
  const limited = rateLimit(request, { name: 'orgs-consent', limit: 30, windowMs: 60 * 60_000, key: guard.wallet });
  if (limited) return limited;

  const parsed = await parseBody(request, consentSchema);
  if (!parsed.ok) return parsed.response;

  const { data: updated, error } = await setConsent(guard.orgId, guard.wallet, parsed.data.consent);
  if (error) {
    console.error('PUT members consent failed:', error);
    return NextResponse.json({ error: 'Failed to update consent' }, { status: 500 });
  }
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, consent: parsed.data.consent });
}
