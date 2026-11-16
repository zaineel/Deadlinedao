import { NextRequest, NextResponse } from 'next/server';
import { connection } from '@/lib/solana/client';
import { requireAdmin } from '@/lib/auth/admin';
import { parseValue } from '@/lib/validation/schemas';
import { reconcilePayoutsSchema } from '@/lib/validation/review-schemas';
import { getUnresolvedPayouts, finalizePayout, releasePayout } from '@/lib/supabase/payouts';
import { transitionGoalStatus } from '@/lib/supabase/goals';
import { decideReconcile, parseUnconfirmed, type SignatureStatus } from '@/lib/solana/payout-classify';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

type Outcome = {
  payoutId: string;
  result: 'finalized' | 'released' | 'waiting' | 'manual' | 'error';
  signature?: string;
};

/**
 * POST /api/admin/payouts/reconcile
 * Body (optional): { payoutId?: uuid }
 *
 * Resolves payout rows left 'pending' or 'unconfirmed:<sig>' after an ambiguous
 * send. Landed -> record the real signature. Failed on-chain, or still unknown
 * after the blockhash expired -> release the claim so it can be retried.
 * 'pending' rows with no signature cannot be checked: they are reported as
 * 'manual' and never released automatically.
 */
export async function POST(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const raw: unknown = await request.json().catch(() => ({}));
    const parsed = parseValue(raw ?? {}, reconcilePayoutsSchema);
    if (!parsed.ok) return parsed.response;

    const { data: rows, error } = await getUnresolvedPayouts(parsed.data.payoutId);
    if (error || !rows) {
      return NextResponse.json({ error: 'Failed to load payouts' }, { status: 500 });
    }

    const outcomes: Outcome[] = [];
    for (const row of rows) {
      try {
        const signature = parseUnconfirmed(row.tx_signature);
        let status: SignatureStatus = null;
        if (signature) {
          const res = await connection.getSignatureStatus(signature, { searchTransactionHistory: true });
          status = res.value;
        }
        const ageMs = Date.now() - new Date(row.created_at).getTime();
        const decision = decideReconcile({ txSignature: row.tx_signature, ageMs, status });

        if (decision.action === 'finalize') {
          const { error: finErr } = await finalizePayout(row.id, decision.signature);
          outcomes.push({ payoutId: row.id, result: finErr ? 'error' : 'finalized', signature: decision.signature });
        } else if (decision.action === 'release') {
          await releasePayout(row.id, row.tx_signature);
          // Same as a definitive failure in the proof flow: reopen so it can be retried.
          if (row.payout_type === 'original_stake' && row.goal_id) {
            await transitionGoalStatus(row.goal_id, 'completed', 'active');
          }
          outcomes.push({ payoutId: row.id, result: 'released' });
        } else if (decision.action === 'manual') {
          outcomes.push({ payoutId: row.id, result: 'manual' });
        } else {
          outcomes.push({ payoutId: row.id, result: 'waiting' });
        }
      } catch (err) {
        // RPC trouble: leave the row untouched, it will be retried next run
        console.error(`[Admin] Reconcile failed for payout ${row.id}:`, err);
        outcomes.push({ payoutId: row.id, result: 'error' });
      }
    }

    const count = (r: Outcome['result']) => outcomes.filter(o => o.result === r).length;
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
  } catch (error) {
    console.error('[Admin] Reconcile error:', error);
    return NextResponse.json({ error: 'Failed to reconcile payouts' }, { status: 500 });
  }
}
