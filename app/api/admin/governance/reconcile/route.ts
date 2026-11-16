import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';
import { governanceDisabledResponse } from '@/lib/governance/flag';
import { reconcileRewardRow, type RewardReconcileResult } from '@/lib/governance/reconcile';
import { finalizeReward, listUnconfirmedRewards, releaseUnconfirmedReward } from '@/lib/supabase/governance';
import { connection } from '@/lib/solana/client';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/governance/reconcile
 * Resolves governance_rewards rows left 'unconfirmed' after an ambiguous send
 * (same rules as /api/admin/payouts/reconcile). Admin key + governance flags.
 */
export async function POST(request: NextRequest) {
  const disabled = governanceDisabledResponse();
  if (disabled) return disabled;
  const denied = requireAdmin(request);
  if (denied) return denied;

  const { data: rows, error } = await listUnconfirmedRewards();
  if (error || !rows) return NextResponse.json({ error: 'Failed to load rewards' }, { status: 500 });

  const outcomes: Array<{ rewardId: string; result: RewardReconcileResult }> = [];
  for (const row of rows) {
    const result = await reconcileRewardRow(row, {
      getStatus: async (sig) => (await connection.getSignatureStatus(sig, { searchTransactionHistory: true })).value,
      finalize: finalizeReward,
      release: releaseUnconfirmedReward,
    });
    outcomes.push({ rewardId: row.id, result });
  }
  const count = (r: RewardReconcileResult) => outcomes.filter((o) => o.result === r).length;
  return NextResponse.json({
    success: true,
    checked: outcomes.length,
    finalized: count('finalized'),
    released: count('released'),
    waiting: count('waiting'),
    manual: count('manual'),
    errors: count('error'),
    outcomes,
  });
}
