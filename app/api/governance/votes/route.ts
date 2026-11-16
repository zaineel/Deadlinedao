import { NextRequest, NextResponse } from 'next/server';
import { governanceDisabledResponse } from '@/lib/governance/flag';
import { requireSession } from '@/lib/auth/session';
import { rateLimit } from '@/lib/rate-limit';
import { parseBody } from '@/lib/validation/schemas';
import { castVoteSchema } from '@/lib/validation/governance-schemas';
import { castVote } from '@/lib/governance/vote';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REFUSAL = {
  // 404 for "not drawn": never confirm that a dispute exists to a non-panelist
  not_panelist: { status: 404, error: 'Assignment not found' },
  not_voting: { status: 409, error: 'Voting is closed for this dispute' },
  window_closed: { status: 409, error: 'The voting window has closed' },
  already_voted: { status: 409, error: 'You already voted differently on this dispute' },
} as const;

/**
 * POST /api/governance/votes  { disputeId, vote: 'overturn' | 'uphold', reason? }
 * Sealed vote by a drawn panelist. Replaying the same vote is idempotent (200).
 * The response never includes anything about other votes.
 */
export async function POST(request: NextRequest) {
  const disabled = governanceDisabledResponse();
  if (disabled) return disabled;

  const limited = rateLimit(request, { name: 'governance-vote', limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const session = requireSession(request);
  if (!session.ok) return session.response;

  const parsed = await parseBody(request, castVoteSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const result = await castVote({
      wallet: session.wallet,
      disputeId: parsed.data.disputeId,
      vote: parsed.data.vote,
      reason: parsed.data.reason,
    });
    switch (result.status) {
      case 'recorded':
        return NextResponse.json({ success: true, replay: false, vote: result.vote }, { status: 201 });
      case 'replay':
        return NextResponse.json({ success: true, replay: true, vote: result.vote });
      case 'refused': {
        const r = REFUSAL[result.reason];
        return NextResponse.json({ error: r.error }, { status: r.status });
      }
      default:
        return NextResponse.json({ error: 'Failed to record vote' }, { status: 500 });
    }
  } catch (error) {
    console.error('[Governance] vote error:', error);
    return NextResponse.json({ error: 'Failed to record vote' }, { status: 500 });
  }
}
