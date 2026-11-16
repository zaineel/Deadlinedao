import { NextResponse } from 'next/server';
import { isFeatureEnabled } from '@/lib/config/features';

export const dynamic = 'force-dynamic';

/** GET /api/features: public booleans only, no secrets. */
export async function GET() {
  return NextResponse.json({
    disputes: isFeatureEnabled('disputes'),
    teams: isFeatureEnabled('teams'),
    orgs: isFeatureEnabled('orgs'),
    push: isFeatureEnabled('push'),
    governance: isFeatureEnabled('governance'),
  });
}
