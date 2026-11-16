import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';
import { featureDisabledResponse } from '@/lib/config/features';
import { runOrgMatchSweep } from '@/lib/orgs/sweep';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/org-matches
 * Admin-key triggered sweep: pays sponsor matches for completed goals of
 * eligible org members that have none yet. Safe to call repeatedly.
 */
export async function POST(request: NextRequest) {
  const disabled = featureDisabledResponse('orgs');
  if (disabled) return disabled;
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const summary = await runOrgMatchSweep();
    return NextResponse.json({ success: true, summary });
  } catch (error) {
    console.error('[Admin] org-matches sweep error:', error);
    return NextResponse.json({ error: 'Sweep failed' }, { status: 500 });
  }
}
