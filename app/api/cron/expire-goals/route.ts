import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { transitionGoalStatus } from '@/lib/supabase';
import { GOAL_GRACE_PERIOD_MS } from '@/lib/config/goals';

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
 * GET /api/cron/expire-goals
 * Marks staked goals as 'failed' once their deadline plus the proof grace
 * period has passed with no completed proof. Their stakes then flow into the
 * Phase 2 reward pool. Idempotent: only 'active' goals are touched, via an
 * atomic status transition.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const cutoff = new Date(Date.now() - GOAL_GRACE_PERIOD_MS).toISOString();
    const { data: expired, error } = await supabase
      .from('goals')
      .select('id')
      .eq('status', 'active')
      .lt('deadline', cutoff);

    if (error) throw error;

    let failed = 0;
    for (const goal of expired ?? []) {
      const { data: moved } = await transitionGoalStatus(goal.id, 'active', 'failed');
      if (moved) failed++;
    }

    console.log(`[Cron] expire-goals: ${failed} of ${expired?.length ?? 0} goals marked failed`);
    return NextResponse.json({ success: true, checked: expired?.length ?? 0, failed });
  } catch (error) {
    console.error('[Cron] expire-goals error:', error);
    return NextResponse.json({ error: 'Failed to expire goals' }, { status: 500 });
  }
}
