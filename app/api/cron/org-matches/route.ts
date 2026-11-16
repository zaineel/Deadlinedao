import { NextRequest, NextResponse } from 'next/server';
import { featureDisabledResponse } from '@/lib/config/features';
import { isAuthorizedCron } from '@/lib/orgs/route-helpers';
import { runOrgMatchSweep } from '@/lib/orgs/sweep';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** GET /api/cron/org-matches: scheduled sponsor-match sweep (Bearer CRON_SECRET). */
export async function GET(request: NextRequest) {
  const disabled = featureDisabledResponse('orgs');
  if (disabled) return disabled;
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const summary = await runOrgMatchSweep();
    console.log('[Cron] org-matches:', JSON.stringify(summary));
    return NextResponse.json({ success: true, summary });
  } catch (error) {
    console.error('[Cron] org-matches error:', error);
    return NextResponse.json({ error: 'Sweep failed' }, { status: 500 });
  }
}
