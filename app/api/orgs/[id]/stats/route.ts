import { NextRequest, NextResponse } from 'next/server';
import { getPool, loadStatsInputs } from '@/lib/orgs/db';
import { orgRouteGuard } from '@/lib/orgs/route-helpers';
import { computeOrgStats } from '@/lib/orgs/stats';
import { solToLamportsExact } from '@/lib/orgs/match';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/orgs/[id]/stats (org admin)
 * Aggregate stats over members who consented, suppressed below the minimum
 * group size. No wallets, goals, descriptions or proofs are ever returned.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await orgRouteGuard(request, (await params).id, { requireAdmin: true });
  if (!guard.ok) return guard.response;

  const { data: pool } = await getPool(guard.orgId);
  if (!pool) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: inputs, error } = await loadStatsInputs(guard.orgId);
  if (error || !inputs) {
    console.error('GET stats failed:', error);
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 });
  }

  const stats = computeOrgStats({
    members: inputs.members.map((m) => ({ wallet: m.wallet, joinedAtMs: Date.parse(m.joined_at), consent: m.consent })),
    goals: inputs.goals.map((g) => ({
      wallet: g.wallet_address,
      status: g.status,
      createdAtMs: Date.parse(g.created_at),
      stakeLamports: solToLamportsExact(g.stake_amount),
    })),
    matches: inputs.matches.map((m) => ({ wallet: m.wallet, amountLamports: Number(m.amount_lamports) })),
    windowStartMs: Date.parse(pool.window_start),
    windowEndMs: Date.parse(pool.window_end),
  });
  return NextResponse.json({ stats });
}
