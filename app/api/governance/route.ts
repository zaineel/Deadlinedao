import { NextRequest, NextResponse } from 'next/server';
import { governanceDisabledResponse } from '@/lib/governance/flag';
import { requireSession } from '@/lib/auth/session';
import { rateLimit } from '@/lib/rate-limit';
import { getGovernanceParams } from '@/lib/governance/params';
import { buildAssignmentView, type AssignmentView } from '@/lib/governance/views';
import { getDisputeById } from '@/lib/supabase/disputes';
import { getGoalById } from '@/lib/supabase/goals';
import { getProofById } from '@/lib/supabase/proofs';
import {
  getVote,
  getVoterStats,
  listGovernanceByIds,
  listPanelDisputeIds,
  listRewardsByWallet,
  listVotes,
} from '@/lib/supabase/governance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ASSIGNMENTS = 30;

/**
 * GET /api/governance
 * The session wallet's panel assignments, voter stats and rewards. Sealed
 * votes: the caller only ever sees their OWN vote on an unresolved dispute;
 * the tally and other voters appear only after resolution (as pseudonyms).
 * The dispute owner's wallet is never returned (pseudonym only).
 */
export async function GET(request: NextRequest) {
  const disabled = governanceDisabledResponse();
  if (disabled) return disabled;

  const limited = rateLimit(request, { name: 'governance-read', limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const session = requireSession(request);
  if (!session.ok) return session.response;

  try {
    const ids = await listPanelDisputeIds(session.wallet);
    if (!ids.data) return NextResponse.json({ error: 'Failed to load assignments' }, { status: 500 });

    const govs = await listGovernanceByIds(ids.data.slice(0, MAX_ASSIGNMENTS));
    if (!govs.data) return NextResponse.json({ error: 'Failed to load assignments' }, { status: 500 });

    const secret = process.env.SESSION_SECRET ?? '';
    const views: AssignmentView[] = [];
    for (const g of govs.data) {
      const { data: dispute } = await getDisputeById(g.dispute_id);
      if (!dispute) continue;
      const { data: goal } = await getGoalById(dispute.goal_id);
      if (!goal) continue;
      const proof = dispute.proof_id ? (await getProofById(dispute.proof_id)).data : null;
      const own = await getVote(g.dispute_id, session.wallet);
      // Other votes are fetched ONLY for resolved disputes.
      const all = g.state === 'resolved' ? ((await listVotes(g.dispute_id)).data ?? []) : [];
      views.push(
        buildAssignmentView(
          {
            dispute,
            governance: { state: g.state, voting_ends_at: g.voting_ends_at, decision: g.decision },
            goal,
            proof: proof
              ? {
                  text_description: proof.text_description,
                  image_url: proof.image_url ?? null,
                  ai_verdict: proof.ai_verdict ?? null,
                  ai_confidence: proof.ai_confidence ?? null,
                  ai_reasoning: proof.ai_reasoning ?? null,
                }
              : null,
            ownVote: own.data ? { vote: own.data.vote, reason: own.data.reason } : null,
            allVotes: all,
          },
          secret
        )
      );
    }

    const stats = await getVoterStats(session.wallet);
    const rewards = await listRewardsByWallet(session.wallet);
    const params = getGovernanceParams();

    return NextResponse.json({
      success: true,
      assignments: views,
      stats: {
        votesCast: stats.data.votes_cast,
        votesAgreed: stats.data.votes_agreed,
        votesMissed: stats.data.votes_missed,
        agreementRate: stats.data.votes_cast > 0 ? stats.data.votes_agreed / stats.data.votes_cast : null,
      },
      rewards: (rewards.data ?? []).map((r) => ({
        disputeId: r.dispute_id,
        amountLamports: Number(r.amount_lamports),
        status: r.status,
      })),
      params: {
        votingWindowHours: params.votingWindowHours,
        minCompletedGoals: params.minCompletedGoals,
        panelSize: params.panelSize,
        quorum: params.quorum,
      },
    });
  } catch (error) {
    console.error('[Governance] list error:', error);
    return NextResponse.json({ error: 'Failed to load assignments' }, { status: 500 });
  }
}
