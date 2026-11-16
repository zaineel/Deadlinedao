import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { transitionGoalStatus } from '@/lib/supabase/goals';
import { getGoalsWithClosedAppealWindow } from '@/lib/supabase/disputes';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. Fails closed if unset. */
function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(request.headers.get('authorization') ?? '');
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * GET /api/cron/finalize-appeals
 * Fails goals whose 48h appeal window closed without a dispute. Goals that
 * were appealed are 'disputed' (not 'rejected_appealable') and never touched.
 * Idempotent: the transition is atomic per goal. Runs even when the disputes
 * flag is off so leftover windows can never hang forever.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: due, error } = await getGoalsWithClosedAppealWindow(new Date());
    if (error || !due) throw error ?? new Error('query failed');

    let failed = 0;
    for (const goal of due) {
      const { data: moved } = await transitionGoalStatus(goal.id, 'rejected_appealable', 'failed');
      if (moved) failed++;
    }

    console.log(`[Cron] finalize-appeals: ${failed} of ${due.length} goals marked failed`);
    return NextResponse.json({ success: true, checked: due.length, failed });
  } catch (error) {
    console.error('[Cron] finalize-appeals error:', error);
    return NextResponse.json({ error: 'Failed to finalize appeals' }, { status: 500 });
  }
}
