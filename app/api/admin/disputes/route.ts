import { NextRequest, NextResponse } from 'next/server';
import { featureDisabledResponse } from '@/lib/config/features';
import { requireAdmin } from '@/lib/auth/admin';
import { parseBody } from '@/lib/validation/schemas';
import { resolveDisputeSchema } from '@/lib/validation/dispute-schemas';
import { resolveDispute } from '@/lib/disputes/resolve';
import { listOpenDisputes } from '@/lib/supabase/disputes';
import { getGoalById } from '@/lib/supabase/goals';
import { getProofById } from '@/lib/supabase/proofs';
import { isGovernanceEnabled } from '@/lib/governance/flag';
import { writeAudit } from '@/lib/supabase/governance';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** GET /api/admin/disputes: open disputes with the goal and the contested proof. */
export async function GET(request: NextRequest) {
  const disabled = featureDisabledResponse('disputes');
  if (disabled) return disabled;
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const { data: disputes, error } = await listOpenDisputes();
    if (error || !disputes) return NextResponse.json({ error: 'Failed to load disputes' }, { status: 500 });

    const items = (
      await Promise.all(
        disputes.map(async (d) => {
          const { data: goal } = await getGoalById(d.goal_id);
          if (!goal) return null;
          const proof = d.proof_id ? (await getProofById(d.proof_id)).data : null;
          return {
            dispute: {
              id: d.id,
              reason: d.reason,
              extra_image_url: d.extra_image_url,
              bond_amount: Number(d.bond_amount),
              created_at: d.created_at,
            },
            goal: {
              id: goal.id,
              title: goal.title,
              description: goal.description,
              wallet_address: goal.wallet_address,
              stake_amount: goal.stake_amount,
              deadline: goal.deadline,
            },
            proof: proof
              ? {
                  text_description: proof.text_description,
                  image_url: proof.image_url,
                  ai_verdict: proof.ai_verdict,
                  ai_confidence: proof.ai_confidence,
                  ai_reasoning: proof.ai_reasoning,
                }
              : null,
          };
        })
      )
    ).filter(Boolean);

    return NextResponse.json({ success: true, count: items.length, items });
  } catch (error) {
    console.error('[Admin] dispute list error:', error);
    return NextResponse.json({ error: 'Failed to load disputes' }, { status: 500 });
  }
}

/**
 * POST /api/admin/disputes  { disputeId, decision: 'overturn' | 'uphold' }
 * Resolving an already resolved dispute is a harmless no-op.
 */
export async function POST(request: NextRequest) {
  const disabled = featureDisabledResponse('disputes');
  if (disabled) return disabled;
  const denied = requireAdmin(request);
  if (denied) return denied;

  const parsed = await parseBody(request, resolveDisputeSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const result = await resolveDispute(parsed.data.disputeId, parsed.data.decision);
    switch (result.status) {
      case 'not_found':
        return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
      case 'noop':
        return NextResponse.json({ success: true, noop: true, status: result.disputeStatus });
      case 'payout_failed':
        return NextResponse.json(
          { error: 'A payout failed; the dispute is still open. Try again.' },
          { status: 502 }
        );
      case 'payout_unconfirmed':
        return NextResponse.json(
          {
            error:
              'A payout may have been sent but is not confirmed. The dispute stays open: reconcile via /api/admin/payouts/reconcile, then retry.',
          },
          { status: 202 }
        );
      case 'resolved':
        if (isGovernanceEnabled()) {
          // Best effort: the governance record is closed by the next cron pass.
          await writeAudit(parsed.data.disputeId, 'admin_resolve_legacy', 'admin', {
            decision: parsed.data.decision,
            note: 'resolved through /api/admin/disputes',
          }).catch(() => undefined);
        }
        return NextResponse.json({
          success: true,
          noop: false,
          status: result.outcome,
          stakeSignature: result.stakeSignature ?? null,
          bondSignature: result.bondSignature ?? null,
        });
      default:
        return NextResponse.json({ error: 'Failed to resolve dispute' }, { status: 500 });
    }
  } catch (error) {
    console.error('[Admin] dispute resolve error:', error);
    return NextResponse.json({ error: 'Failed to resolve dispute' }, { status: 500 });
  }
}
