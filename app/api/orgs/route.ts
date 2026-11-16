import { NextRequest, NextResponse } from 'next/server';
import { featureDisabledResponse } from '@/lib/config/features';
import { requireSession } from '@/lib/auth/session';
import { rateLimit } from '@/lib/rate-limit';
import { parseBody } from '@/lib/validation/schemas';
import { createOrgSchema } from '@/lib/validation/orgs-schemas';
import { createOrg, listOrgsForWallet } from '@/lib/orgs/db';
import { solToLamportsExact } from '@/lib/orgs/match';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/orgs: orgs the session wallet administers or belongs to. */
export async function GET(request: NextRequest) {
  const disabled = featureDisabledResponse('orgs');
  if (disabled) return disabled;
  const session = requireSession(request);
  if (!session.ok) return session.response;

  const { data, error } = await listOrgsForWallet(session.wallet);
  if (error || !data) {
    console.error('GET /api/orgs failed:', error);
    return NextResponse.json({ error: 'Failed to load organizations' }, { status: 500 });
  }

  return NextResponse.json({
    organizations: data.map(({ org, pool, membership, isAdmin }) => ({
      id: org.id,
      name: org.name,
      isAdmin,
      // invite code and balances are for admins only
      inviteCode: isAdmin ? org.invite_code : undefined,
      membership: membership
        ? { joinedAt: membership.joined_at, consent: membership.consent_aggregate }
        : null,
      program: pool
        ? {
            matchRateBps: pool.match_rate_bps,
            perMemberCapLamports: pool.per_member_cap_lamports,
            windowStart: pool.window_start,
            windowEnd: pool.window_end,
            ...(isAdmin
              ? {
                  fundedLamports: pool.funded_lamports,
                  remainingLamports: pool.remaining_lamports,
                  withdrawnLamports: pool.withdrawn_lamports,
                }
              : {}),
          }
        : null,
    })),
  });
}

/** POST /api/orgs: create an organization and its (unfunded) sponsor pool. */
export async function POST(request: NextRequest) {
  const disabled = featureDisabledResponse('orgs');
  if (disabled) return disabled;
  const session = requireSession(request);
  if (!session.ok) return session.response;
  const limited = rateLimit(request, { name: 'orgs-create', limit: 5, windowMs: 60 * 60_000, key: session.wallet });
  if (limited) return limited;

  const parsed = await parseBody(request, createOrgSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const adminWallets = [...new Set([session.wallet, ...body.additionalAdminWallets])];
  const { data: org, error } = await createOrg({
    name: body.name,
    adminWallets,
    matchRateBps: Math.round(body.matchRatePercent * 100),
    perMemberCapLamports: solToLamportsExact(body.perMemberCapSol),
    windowStart: new Date(body.windowStart).toISOString(),
    windowEnd: new Date(body.windowEnd).toISOString(),
  });
  if (error || !org) {
    console.error('POST /api/orgs failed:', error);
    return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 });
  }
  return NextResponse.json({ success: true, id: org.id, name: org.name, inviteCode: org.invite_code }, { status: 201 });
}
