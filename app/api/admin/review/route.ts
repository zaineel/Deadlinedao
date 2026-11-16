import { NextRequest, NextResponse } from 'next/server';
import { getAllGoals, getProofsByGoal, getGoalById, transitionGoalStatus } from '@/lib/supabase';
import { returnStake } from '@/lib/solana';
import { requireAdmin } from '@/lib/auth/admin';
import { parseBody } from '@/lib/validation/schemas';
import { reviewDecisionSchema } from '@/lib/validation/review-schemas';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Goals awaiting a human decision: status 'pending_validation' that were
 * actually staked (not goals still waiting for their stake transaction)
 * and have at least one submitted proof.
 */
function isStaked(goal: { stake_tx_signature?: string | null }) {
  return !!goal.stake_tx_signature && goal.stake_tx_signature !== 'pending';
}

/**
 * GET /api/admin/review
 * List goals needing manual review, with their latest proof and AI verdict.
 */
export async function GET(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const { data: goals, error } = await getAllGoals();
    if (error || !goals) {
      return NextResponse.json({ error: 'Failed to fetch goals' }, { status: 500 });
    }

    const candidates = goals.filter(g => g.status === 'pending_validation' && isStaked(g as never));

    const items = (
      await Promise.all(
        candidates.map(async goal => {
          const { data: proofs } = await getProofsByGoal(goal.id);
          const proof = proofs?.[0];
          if (!proof) return null;
          return {
            goal: {
              id: goal.id,
              title: goal.title,
              description: goal.description,
              wallet_address: goal.wallet_address,
              stake_amount: goal.stake_amount,
              deadline: goal.deadline,
            },
            proof: {
              text_description: proof.text_description,
              image_url: proof.image_url,
              submitted_at: proof.submitted_at,
              ai_verdict: proof.ai_verdict,
              ai_confidence: proof.ai_confidence,
              quality_score: proof.quality_score,
              ai_reasoning: proof.ai_reasoning,
            },
          };
        })
      )
    ).filter(Boolean);

    return NextResponse.json({ success: true, count: items.length, items });
  } catch (error) {
    console.error('[Admin] Review list error:', error);
    return NextResponse.json({ error: 'Failed to load review queue' }, { status: 500 });
  }
}

/**
 * POST /api/admin/review
 * Body: { goalId: string, decision: 'approve' | 'reject' }
 * approve -> goal completed + stake returned; reject -> goal failed (stake forfeited
 * into the Phase 2 reward pool).
 */
export async function POST(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const parsed = await parseBody(request, reviewDecisionSchema);
    if (!parsed.ok) return parsed.response;
    const { goalId, decision } = parsed.data;

    const { data: goal } = await getGoalById(goalId);
    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }
    if (goal.status !== 'pending_validation' || !isStaked(goal as never)) {
      return NextResponse.json({ error: 'Goal is not awaiting review' }, { status: 409 });
    }

    const { data: proofs } = await getProofsByGoal(goalId);
    if (!proofs || proofs.length === 0) {
      return NextResponse.json({ error: 'Goal has no submitted proof' }, { status: 409 });
    }

    if (decision === 'reject') {
      const { data: moved } = await transitionGoalStatus(goalId, 'pending_validation', 'failed');
      if (!moved) {
        return NextResponse.json({ error: 'Goal was already processed' }, { status: 409 });
      }
      console.log(`[Admin] Review: goal ${goalId} rejected`);
      return NextResponse.json({ success: true, goalId, status: 'failed' });
    }

    // approve: claim the transition first so concurrent clicks can't double-pay
    const { data: moved } = await transitionGoalStatus(goalId, 'pending_validation', 'completed');
    if (!moved) {
      return NextResponse.json({ error: 'Goal was already processed' }, { status: 409 });
    }

    const payout = await returnStake(goal);
    if (payout.status === 'unconfirmed') {
      // May have landed: keep the goal completed and the claim in place.
      console.error(`[Admin] Review approve payout unconfirmed for ${goalId}`);
      return NextResponse.json(
        {
          success: true,
          goalId,
          status: 'completed',
          payout: { status: 'unconfirmed', note: 'Transfer may have landed; run POST /api/admin/payouts/reconcile' },
        },
        { status: 202 }
      );
    }
    if (payout.status === 'failed') {
      // Put it back in the queue so the admin can retry
      await transitionGoalStatus(goalId, 'completed', 'pending_validation');
      console.error(`[Admin] Review approve payout failed for ${goalId}: ${payout.error}`);
      return NextResponse.json(
        { error: 'Stake payout failed; goal returned to the review queue. Try again.' },
        { status: 502 }
      );
    }

    console.log(`[Admin] Review: goal ${goalId} approved (${payout.status})`);
    return NextResponse.json({
      success: true,
      goalId,
      status: 'completed',
      payout:
        payout.status === 'sent'
          ? { signature: payout.signature, amount: payout.amount }
          : { note: 'Stake was already returned earlier' },
    });
  } catch (error) {
    console.error('[Admin] Review decision error:', error);
    return NextResponse.json({ error: 'Failed to process review' }, { status: 500 });
  }
}
