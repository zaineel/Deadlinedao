import { NextRequest, NextResponse } from 'next/server';
import { featureDisabledResponse } from '@/lib/config/features';
import { requireSession } from '@/lib/auth/session';
import { rateLimit } from '@/lib/rate-limit';
import { parseBody } from '@/lib/validation/schemas';
import { createDisputeSchema } from '@/lib/validation/dispute-schemas';
import { openDispute } from '@/lib/disputes/open';
import { computeBond, isAppealWindowOpen } from '@/lib/disputes/logic';
import { getGoalsByWallet } from '@/lib/supabase/goals';
import { listDisputesByGoalIds } from '@/lib/supabase/disputes';
import { getEscrowAddress } from '@/lib/solana/escrow';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const REFUSAL_STATUS = {
  not_owner: 404,
  not_appealable: 409,
  window_closed: 409,
  already_disputed: 409,
  signature_reused: 409,
} as const;

const REFUSAL_MESSAGE = {
  not_owner: 'Goal not found',
  not_appealable: 'This goal cannot be appealed',
  window_closed: 'The appeal window has closed',
  already_disputed: 'This goal already has a dispute',
  signature_reused: 'This transaction has already been used',
} as const;

/**
 * POST /api/disputes
 * Appeal an AI rejection. Wallet comes from the session. The bond (5% of the
 * stake, in SOL) must already be sent to escrow; the transaction is verified
 * on-chain and may back only one dispute.
 */
export async function POST(request: NextRequest) {
  const disabled = featureDisabledResponse('disputes');
  if (disabled) return disabled;

  const limited = rateLimit(request, { name: 'disputes', limit: 5, windowMs: 60_000 });
  if (limited) return limited;

  const session = requireSession(request);
  if (!session.ok) return session.response;

  const parsed = await parseBody(request, createDisputeSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const result = await openDispute({
      sessionWallet: session.wallet,
      goalId: parsed.data.goalId,
      reason: parsed.data.reason,
      extraImageUrl: parsed.data.extraImageUrl,
      bondSignature: parsed.data.bondSignature,
    });

    switch (result.status) {
      case 'opened':
        return NextResponse.json(
          { success: true, disputeId: result.disputeId, bondAmount: result.bondAmount, goal_status: 'disputed' },
          { status: 201 }
        );
      case 'goal_not_found':
        return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
      case 'refused':
        return NextResponse.json(
          { error: REFUSAL_MESSAGE[result.reason] },
          { status: REFUSAL_STATUS[result.reason] }
        );
      case 'bond_invalid':
        return NextResponse.json(
          { error: 'Bond transaction could not be verified. Wait a moment and try again.' },
          { status: 400 }
        );
      default:
        return NextResponse.json({ error: 'Failed to open dispute' }, { status: 500 });
    }
  } catch (error) {
    console.error('[Disputes] open error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/disputes
 * The session wallet's disputes, plus bond quotes for goals that can still be
 * appealed. 404 when the feature is off (the UI uses that to hide itself).
 */
export async function GET(request: NextRequest) {
  const disabled = featureDisabledResponse('disputes');
  if (disabled) return disabled;

  const session = requireSession(request);
  if (!session.ok) return session.response;

  try {
    const { data: goals, error } = await getGoalsByWallet(session.wallet);
    if (error || !goals) return NextResponse.json({ error: 'Failed to load disputes' }, { status: 500 });

    const { data: disputes, error: dErr } = await listDisputesByGoalIds(goals.map((g) => g.id));
    if (dErr || !disputes) return NextResponse.json({ error: 'Failed to load disputes' }, { status: 500 });

    const now = Date.now();
    const appealable = goals
      .filter((g) => g.status === 'rejected_appealable' && isAppealWindowOpen(g.appeal_deadline, now))
      .map((g) => ({
        goalId: g.id,
        appealDeadline: g.appeal_deadline,
        bondAmount: computeBond(Number(g.stake_amount)),
      }));

    return NextResponse.json({
      success: true,
      escrowAddress: appealable.length > 0 ? getEscrowAddress() : null,
      appealable,
      disputes: disputes.map((d) => ({
        id: d.id,
        goalId: d.goal_id,
        reason: d.reason,
        bondAmount: Number(d.bond_amount),
        status: d.status,
        createdAt: d.created_at,
        resolvedAt: d.resolved_at,
      })),
    });
  } catch (error) {
    console.error('[Disputes] list error:', error);
    return NextResponse.json({ error: 'Failed to load disputes' }, { status: 500 });
  }
}
