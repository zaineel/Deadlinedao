import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { isGovernanceEnabled } from '@/lib/governance/flag';
import { runGovernanceCycle } from '@/lib/governance/resolve';

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
 * GET /api/cron/resolve-disputes
 * Draws panels for new disputes, resolves votes whose window closed (or that
 * are complete) through the existing disputes resolution path, escalates ties
 * and missing quorum to the admin, and pays majority-voter rewards.
 * Idempotent. With the governance flag off it does nothing.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isGovernanceEnabled()) return NextResponse.json({ success: true, skipped: true });

  try {
    const summary = await runGovernanceCycle();
    console.log('[Cron] resolve-disputes:', JSON.stringify(summary));
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    console.error('[Cron] resolve-disputes error:', error);
    return NextResponse.json({ error: 'Failed to resolve disputes' }, { status: 500 });
  }
}
